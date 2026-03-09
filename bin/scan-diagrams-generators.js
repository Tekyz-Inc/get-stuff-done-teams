'use strict';

function genSystemArchitecture(analysisData) {
  try {
    const services = (analysisData.services || []).slice(0, 5);
    if (services.length) {
      const lines = [
        'graph TB',
        '  classDef user fill:#0d6efd,stroke:#0d6efd,color:#fff',
        '  classDef svc fill:#6f42c1,stroke:#6f42c1,color:#fff',
        '  User([User]):::user'
      ];
      services.forEach((s, i) => {
        lines.push('  Svc' + i + '[' + s + ']:::svc');
        lines.push('  User --> Svc' + i);
      });
      return lines.join('\n');
    }
    return 'graph TB\n  classDef user fill:#0d6efd,stroke:#0d6efd,color:#fff\n  classDef svc fill:#6f42c1,stroke:#6f42c1,color:#fff\n  classDef db fill:#198754,stroke:#198754,color:#fff\n  User([User]):::user\n  App[Application]:::svc\n  DB[(Database)]:::db\n  User --> App --> DB';
  } catch {
    return 'graph TB\n  App[Application] --> DB[(Database)]';
  }
}

function genAppArchitecture(analysisData) {
  try {
    const layers = analysisData.layers || ['Controllers', 'Services', 'Repositories'];
    const lines = ['graph TB', '  subgraph App[Application]'];
    for (let i = 0; i < layers.length; i++) {
      lines.push('    L' + i + '[' + layers[i] + ']');
      if (i > 0) lines.push('    L' + (i - 1) + ' --> L' + i);
    }
    lines.push('  end');
    return lines.join('\n');
  } catch {
    return 'graph TB\n  subgraph App\n    Controllers --> Services --> Repositories\n  end';
  }
}

function genWorkflow(analysisData) {
  try {
    const states = analysisData.states || [];
    if (states.length >= 2) {
      const lines = ['stateDiagram-v2', '  [*] --> ' + states[0]];
      for (let i = 0; i < states.length - 1; i++) {
        lines.push('  ' + states[i] + ' --> ' + states[i + 1]);
      }
      lines.push('  ' + states[states.length - 1] + ' --> [*]');
      return lines.join('\n');
    }
    return 'stateDiagram-v2\n  [*] --> Pending\n  Pending --> Active\n  Active --> Completed\n  Active --> Cancelled\n  Completed --> [*]\n  Cancelled --> [*]';
  } catch {
    return 'stateDiagram-v2\n  [*] --> Active\n  Active --> Inactive\n  Inactive --> [*]';
  }
}

function genDataFlow(analysisData) {
  try {
    const endpoints = analysisData.endpoints || [];
    if (endpoints.length) {
      return 'flowchart TD\n  Input[' + endpoints[0] + ']\n  Input --> Validate --> Service --> DB[(Store)]\n  Service --> Queue([Queue])\n  DB --> Response\n  Queue --> Response';
    }
    return 'flowchart TD\n  Input([HTTP Request]) --> Validate{Valid?}\n  Validate -->|yes| Service[Business Logic]\n  Validate -->|no| Error([400 Error])\n  Service --> DB[(Database)]\n  DB --> Response([HTTP Response])';
  } catch {
    return 'flowchart TD\n  Input --> Validate --> Process --> Store --> Respond';
  }
}

function genSequence(analysisData) {
  try {
    const ep = (analysisData.endpoints || ['POST /api/resource'])[0];
    return 'sequenceDiagram\n  autonumber\n  Client->>Server: ' + ep + '\n  Server->>Validator: validate(body)\n  Validator-->>Server: ok\n  Server->>DB: query()\n  DB-->>Server: result\n  Server-->>Client: 200 Response';
  } catch {
    return 'sequenceDiagram\n  Client->>Server: Request\n  Server->>DB: Query\n  DB-->>Server: Result\n  Server-->>Client: Response';
  }
}

function genDatabaseSchema(schemaData) {
  try {
    if (!schemaData || !schemaData.detected || !schemaData.entities || schemaData.entities.length === 0) return '';
    const relMap = { 'one-to-many': '||--o{', 'many-to-one': '}o--||', 'many-to-many': '}o--o{', 'one-to-one': '||--||' };
    const lines = ['erDiagram'];
    for (const entity of schemaData.entities.slice(0, 8)) {
      lines.push('  ' + entity.name + ' {');
      for (const f of (entity.fields || []).slice(0, 10)) {
        lines.push('    ' + (f.type || 'string') + ' ' + f.name);
      }
      lines.push('  }');
    }
    for (const entity of schemaData.entities) {
      for (const rel of (entity.relations || [])) {
        const notation = relMap[rel.type] || '||--o{';
        lines.push('  ' + rel.fromEntity + ' ' + notation + ' ' + rel.toEntity + ' : "has"');
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

module.exports = { genSystemArchitecture, genAppArchitecture, genWorkflow, genDataFlow, genSequence, genDatabaseSchema };
