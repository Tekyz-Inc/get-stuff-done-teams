# Architecture — {Project Name}

## Last Updated: {Date}

## System Overview
{High-level description of the system architecture — 2-3 paragraphs}

## Components

### {Component Name}
- **Purpose**: {what it does}
- **Location**: `src/{path}/`
- **Dependencies**: {other components, external services}
- **Key Methods/Endpoints**: {list}

## Data Models

### {Model Name}
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | auto-generated |

## API Structure

### {Endpoint Group}
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/{resource} | required | {description} |

## External Integrations

| Service | Purpose | Auth Method | Documentation |
|---------|---------|-------------|---------------|
| {service} | {what it does} | {API key / OAuth / etc.} | {link} |

## Design Decisions

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| {date} | {what was decided} | {why} | {what else was considered} |
