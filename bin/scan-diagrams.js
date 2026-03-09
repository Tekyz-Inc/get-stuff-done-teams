'use strict';

const {
  genSystemArchitecture,
  genAppArchitecture,
  genWorkflow,
  genDataFlow,
  genSequence,
  genDatabaseSchema
} = require('./scan-diagrams-generators');

const PLACEHOLDER_HTML = '<div class="diagram-placeholder">\n  <p>Diagram unavailable — rendering tools not found</p>\n  <p>Install: <code>npm install -g @mermaid-js/mermaid-cli</code></p>\n</div>';

const NOTES = {
  'system-architecture': 'C4-style context diagram showing services, databases, and external integrations',
  'app-architecture':    'Layered diagram showing framework architecture and component boundaries',
  'workflow':            'State machine derived from status enums and state transition logic',
  'data-flow':           'Data flow from user input through validation, persistence, and async processing',
  'sequence':            'Request/response sequence for the primary API endpoint',
  'database-schema':     'Entity-relationship diagram generated from ORM/schema definitions'
};

const DIAGRAM_DEFS = [
  { type: 'system-architecture', title: 'System Architecture',     typeBadge: 'graph TB',       gen: (a) => genSystemArchitecture(a) },
  { type: 'app-architecture',    title: 'Application Architecture', typeBadge: 'graph TB',       gen: (a) => genAppArchitecture(a) },
  { type: 'workflow',            title: 'Workflow',                 typeBadge: 'stateDiagram-v2', gen: (a) => genWorkflow(a) },
  { type: 'data-flow',           title: 'Data Flow',                typeBadge: 'flowchart TD',   gen: (a) => genDataFlow(a) },
  { type: 'sequence',            title: 'Sequence',                 typeBadge: 'sequenceDiagram', gen: (a) => genSequence(a) },
  { type: 'database-schema',     title: 'Database Schema',          typeBadge: 'erDiagram',      gen: (_, s) => genDatabaseSchema(s) }
];

function buildPlaceholder(def, mmd) {
  return {
    type: def.type,
    title: def.title,
    typeBadge: def.typeBadge,
    svgContent: PLACEHOLDER_HTML,
    mmdSource: mmd || '',
    note: NOTES[def.type] || '',
    rendered: false,
    rendererUsed: 'placeholder'
  };
}

function generateDiagrams(analysisData, schemaData, options) {
  try {
    const { renderDiagram } = require('./scan-renderer');
    const results = [];
    for (const def of DIAGRAM_DEFS) {
      try {
        const mmd = def.gen(analysisData, schemaData);
        const isDbSchema = def.type === 'database-schema';
        const noSchema = !schemaData || !schemaData.detected || !mmd;
        if (isDbSchema && noSchema) {
          results.push(buildPlaceholder(def, ''));
        } else {
          const rendered = renderDiagram(mmd, def.type, options || {});
          results.push({
            type: def.type,
            title: def.title,
            typeBadge: def.typeBadge,
            svgContent: rendered.svgContent,
            mmdSource: mmd,
            note: NOTES[def.type] || '',
            rendered: rendered.rendered,
            rendererUsed: rendered.rendererUsed
          });
        }
      } catch {
        results.push(buildPlaceholder(def, ''));
      }
    }
    return results;
  } catch {
    return DIAGRAM_DEFS.map(def => buildPlaceholder(def));
  }
}

module.exports = { generateDiagrams };
