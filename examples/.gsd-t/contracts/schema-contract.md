# Schema Contract — Example

## Users Table
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| email | varchar(255) | unique, not null |
| name | varchar(255) | not null |
| password_hash | varchar(255) | not null |
| created_at | timestamp | not null, default now() |
| updated_at | timestamp | not null, default now() |

**Owner**: data-layer domain
**Consumers**: auth domain
