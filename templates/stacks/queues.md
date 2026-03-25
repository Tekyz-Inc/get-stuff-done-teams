# Queue / Background Job Standards (When Queue Library Detected)

These rules are MANDATORY. Violations fail the task. No exceptions.
Applies when `bullmq`, `bull`, `amqplib`, `@aws-sdk/client-sqs`, `bee-queue`, `agenda`, `celery`, `dramatiq`, `rq`, or `arq` is in dependencies.

---

## 1. Job Definition

```
MANDATORY:
  ├── Every job has a unique, descriptive name: "email.welcome", "order.process", "report.generate"
  ├── Job payload is a plain serializable object — no class instances, functions, or circular refs
  ├── Define a schema (Zod/Pydantic) for each job's payload — validate on enqueue AND process
  ├── Include metadata in payload: correlationId, userId, enqueuedAt
  ├── Jobs must be versioned: include a version field so processors handle old/new shapes
  ├── Keep payloads small — store large data externally (S3, DB), pass a reference
  └── NEVER put secrets, tokens, or full user records in job payloads
```

**GOOD**
```typescript
import { z } from "zod";

const WelcomeEmailJobSchema = z.object({
  version: z.literal(1),
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  correlationId: z.string().uuid(),
  enqueuedAt: z.string().datetime(),
});

type WelcomeEmailJob = z.infer<typeof WelcomeEmailJobSchema>;
```

**BAD** — untyped, bloated payload:
```typescript
await queue.add("email", {
  user: entireUserObject,  // Too large, contains password hash
  template: fs.readFileSync("..."),  // Not serializable properly
});
```

---

## 2. Idempotency

```
MANDATORY:
  ├── Every job handler MUST be idempotent — safe to run 2x, 10x, 100x
  ├── Use a deduplication key: check if this exact job was already processed
  ├── For database writes: use upsert or check-before-insert with unique constraints
  ├── For external API calls: use idempotency keys (Stripe, payment providers)
  ├── For emails/notifications: track "sent" status, skip if already sent
  ├── Store job completion records: { jobId, completedAt, result }
  └── NEVER assume a job runs exactly once — retries, crashes, and duplicates happen
```

**GOOD**
```typescript
async function processWelcomeEmail(job: Job<WelcomeEmailJob>): Promise<void> {
  // Idempotency check
  const existing = await db.jobResult.findUnique({
    where: { jobId: job.id },
  });
  if (existing) {
    logger.info(`Job ${job.id} already processed, skipping`);
    return;
  }

  await emailService.send({
    to: job.data.email,
    template: "welcome",
    data: { name: job.data.name },
  });

  // Record completion
  await db.jobResult.create({
    data: { jobId: job.id, completedAt: new Date(), status: "SUCCESS" },
  });
}
```

---

## 3. Retry & Backoff

```
MANDATORY:
  ├── Configure retry with exponential backoff — not fixed intervals
  ├── Set a max retry count (3-5 for most jobs, higher for non-critical)
  ├── Use backoff formula: delay = baseDelay * 2^attempt + jitter
  ├── Differentiate retryable vs non-retryable errors:
  │     ├── Retryable: network timeout, 429, 503, DB connection lost
  │     └── Non-retryable: validation error, 404, business rule violation
  ├── Non-retryable errors: fail immediately, don't waste retry attempts
  ├── Log each retry attempt with attempt number, error, and next retry time
  └── NEVER retry indefinitely — always have a max attempts ceiling
```

**GOOD**
```typescript
// BullMQ configuration
const queue = new Queue("emails", {
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,  // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// In processor — skip retries for non-retryable errors
async function processJob(job: Job): Promise<void> {
  try {
    await doWork(job.data);
  } catch (error) {
    if (error instanceof ValidationError || error.status === 404) {
      // Non-retryable — throw UnrecoverableError to skip remaining retries
      throw new UnrecoverableError(error.message);
    }
    throw error;  // Retryable — BullMQ will retry with backoff
  }
}
```

---

## 4. Dead Letter Queue (DLQ)

```
MANDATORY:
  ├── Failed jobs (exhausted all retries) go to a dead letter queue — not discarded
  ├── DLQ preserves: original payload, all error messages, attempt history
  ├── Monitor DLQ size — alert when items accumulate (threshold: 10+)
  ├── Build a process to inspect and replay DLQ items after fixing the root cause
  ├── DLQ items have a TTL — auto-delete after 30 days to prevent unbounded growth
  └── NEVER silently discard failed jobs — they indicate bugs or infrastructure issues
```

**GOOD**
```typescript
// BullMQ — failed jobs stay in the "failed" set
// Create a DLQ worker that monitors failures
const dlqWorker = new Worker("emails", async (job) => {
  // This processes the main queue. On final failure:
}, {
  settings: {
    backoffStrategy: (attemptsMade) => Math.pow(2, attemptsMade) * 2000,
  },
});

dlqWorker.on("failed", async (job, error) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    logger.error("Job moved to DLQ", {
      jobId: job.id,
      queue: job.queueName,
      payload: job.data,
      error: error.message,
      attempts: job.attemptsMade,
    });
    await alerting.notify("dlq-alert", `Job ${job.id} failed permanently`);
  }
});
```

---

## 5. Concurrency & Rate Limiting

```
MANDATORY:
  ├── Set concurrency per worker: how many jobs process simultaneously
  ├── Match concurrency to resource capacity (DB connections, API rate limits, memory)
  ├── Use rate limiting for external API calls: e.g., max 10 emails/second
  ├── Separate queues for different priority levels: critical, default, low
  ├── Heavy jobs (report generation, file processing) get lower concurrency
  ├── Lightweight jobs (notifications, logging) can have higher concurrency
  └── NEVER set unlimited concurrency — it will overwhelm downstream services
```

**GOOD**
```typescript
// Different workers with appropriate concurrency
const emailWorker = new Worker("emails", processEmail, {
  concurrency: 5,           // 5 concurrent email sends
  limiter: { max: 10, duration: 1000 },  // Max 10/second (provider rate limit)
});

const reportWorker = new Worker("reports", processReport, {
  concurrency: 2,           // Heavy — limit to 2 concurrent
});

const notificationWorker = new Worker("notifications", processNotification, {
  concurrency: 20,          // Lightweight — higher concurrency OK
});
```

---

## 6. Graceful Shutdown

```
MANDATORY:
  ├── On SIGTERM/SIGINT: stop accepting new jobs, finish in-progress jobs
  ├── Set a shutdown timeout (30s) — force-kill if jobs don't complete
  ├── Close queue connections after workers drain
  ├── Log shutdown progress: "Waiting for N jobs to complete..."
  ├── In Kubernetes/Docker: handle SIGTERM (container stop signal)
  └── NEVER kill workers abruptly — in-progress jobs become stuck/lost
```

**GOOD**
```typescript
const SHUTDOWN_TIMEOUT = 30_000;

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  const shutdownTimer = setTimeout(() => {
    logger.error("Shutdown timeout exceeded, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Stop accepting new jobs, wait for in-progress to finish
    await Promise.all([
      emailWorker.close(),
      reportWorker.close(),
      notificationWorker.close(),
    ]);
    await queue.close();
    logger.info("All workers shut down cleanly");
  } finally {
    clearTimeout(shutdownTimer);
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

---

## 7. Job Scheduling & Delays

```
MANDATORY:
  ├── Use delay for deferred jobs: "send reminder in 24 hours"
  ├── Use repeat/cron for recurring jobs: "generate report every Monday 9 AM"
  ├── Cron jobs must be idempotent — scheduler may fire twice on restart
  ├── Store schedule definitions in config — not hardcoded in code
  ├── Recurring jobs: use jobId to prevent duplicates (same ID = same job)
  └── NEVER use setTimeout/setInterval for scheduled work — use the queue's scheduler
```

**GOOD**
```typescript
// Delayed job — send 24h later
await queue.add("reminder.24h", { userId, orderId }, {
  delay: 24 * 60 * 60 * 1000,  // 24 hours in ms
});

// Recurring job — daily report at 9 AM UTC
await queue.add("report.daily", {}, {
  repeat: { pattern: "0 9 * * *" },  // Cron syntax
  jobId: "daily-report",              // Prevents duplicates on restart
});
```

---

## 8. Monitoring & Observability

```
MANDATORY:
  ├── Track per-queue: active jobs, waiting jobs, completed count, failed count
  ├── Track per-job: processing duration, attempts used, wait time (enqueued → started)
  ├── Alert on: DLQ growth, queue depth exceeding threshold, processing time spikes
  ├── Dashboard: queue health view showing all metrics above
  ├── Include correlationId in all job logs for end-to-end tracing
  ├── Log job lifecycle: enqueued → active → completed/failed with timing
  └── NEVER run queues without monitoring — silent failures accumulate
```

**GOOD**
```typescript
// Lifecycle logging
worker.on("active", (job) => {
  logger.info("Job started", {
    jobId: job.id,
    queue: job.queueName,
    correlationId: job.data.correlationId,
    waitTimeMs: Date.now() - job.timestamp,
  });
});

worker.on("completed", (job, result) => {
  logger.info("Job completed", {
    jobId: job.id,
    queue: job.queueName,
    correlationId: job.data.correlationId,
    durationMs: Date.now() - job.processedOn!,
    attempts: job.attemptsMade,
  });
});

worker.on("failed", (job, error) => {
  logger.error("Job failed", {
    jobId: job?.id,
    queue: job?.queueName,
    correlationId: job?.data.correlationId,
    error: error.message,
    attempt: job?.attemptsMade,
    maxAttempts: job?.opts.attempts,
  });
});
```

---

## 9. Queue Architecture

```
MANDATORY:
  ├── One queue per job domain: "emails", "orders", "reports" — not one mega-queue
  ├── Producers (enqueue) and consumers (process) are separate concerns
  ├── Producer code lives in the service layer — not in route handlers
  ├── Consumer/worker code lives in its own directory: workers/ or jobs/
  ├── Queue configuration (connection, retry, concurrency) in a central config file
  ├── Use a shared connection (Redis/AMQP) across queues — don't create connection per queue
  └── NEVER process jobs in the web server process — use dedicated worker processes
```

**GOOD** — project structure:
```
src/
├── queues/
│   ├── connection.ts      ← Shared Redis/AMQP connection
│   ├── email.queue.ts     ← Queue definition + add() helpers
│   ├── order.queue.ts
│   └── report.queue.ts
├── workers/
│   ├── email.worker.ts    ← Job processor for email queue
│   ├── order.worker.ts
│   └── report.worker.ts
├── services/
│   └── order.service.ts   ← Enqueues jobs via queue helpers
└── worker.ts              ← Entry point: starts all workers (separate from app.ts)
```

---

## 10. Testing

```
MANDATORY:
  ├── Test job handlers as pure functions — pass payload, assert side effects
  ├── Mock the queue in service tests — verify job was enqueued with correct payload
  ├── Integration tests: use a real queue (local Redis) with test-specific prefix
  ├── Test retry behavior: throw retryable error, verify retry count
  ├── Test idempotency: process the same job twice, verify no duplicate side effects
  ├── Test DLQ: exhaust retries, verify job lands in failed state
  └── NEVER depend on timing in tests — use queue events, not setTimeout
```

**GOOD**
```typescript
describe("processWelcomeEmail", () => {
  it("sends email and records completion", async () => {
    const emailSpy = vi.spyOn(emailService, "send");
    const job = createMockJob({ email: "test@example.com", name: "Test" });

    await processWelcomeEmail(job);

    expect(emailSpy).toHaveBeenCalledWith({
      to: "test@example.com",
      template: "welcome",
      data: { name: "Test" },
    });
    const record = await db.jobResult.findUnique({ where: { jobId: job.id } });
    expect(record).toBeTruthy();
    expect(record!.status).toBe("SUCCESS");
  });

  it("is idempotent — skips if already processed", async () => {
    const job = createMockJob({ email: "test@example.com", name: "Test" });
    await processWelcomeEmail(job);  // First run

    const emailSpy = vi.spyOn(emailService, "send").mockClear();
    await processWelcomeEmail(job);  // Second run — should skip

    expect(emailSpy).not.toHaveBeenCalled();
  });
});
```

---

## Anti-Patterns

```
NEVER:
  ├── Process jobs in the web server process — use separate worker processes
  ├── One mega-queue for all job types — separate by domain
  ├── Assume exactly-once delivery — always design for at-least-once (idempotent handlers)
  ├── Put large data in job payloads — store externally, pass reference
  ├── Retry non-retryable errors (validation, 404) — fail immediately
  ├── Unlimited concurrency — will overwhelm downstream services
  ├── setTimeout/setInterval for scheduled work — use queue scheduler
  ├── Kill workers without graceful shutdown — jobs become stuck
  ├── Silent DLQ — monitor and alert on dead letter growth
  ├── Timing-dependent tests — use queue events for assertions
  └── Secrets or tokens in job payloads — they persist in queue storage
```

---

## Queue Verification Checklist

- [ ] One queue per domain, shared connection
- [ ] Job payloads are schema-validated, small, and serializable
- [ ] Every handler is idempotent with deduplication check
- [ ] Retry with exponential backoff, non-retryable errors fail fast
- [ ] Dead letter queue configured with monitoring and alerts
- [ ] Concurrency set per worker based on downstream capacity
- [ ] Rate limiting for external API calls
- [ ] Graceful shutdown handles SIGTERM with timeout
- [ ] Recurring jobs use cron with duplicate prevention (jobId)
- [ ] Workers run in separate processes from the web server
- [ ] Job lifecycle logged with correlationId for tracing
- [ ] Tests verify idempotency, retry behavior, and DLQ
