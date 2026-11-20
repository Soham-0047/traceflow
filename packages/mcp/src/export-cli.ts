#!/usr/bin/env node
import { runExport } from './export.js';

runExport(process.argv.slice(2), process.env).then(
  (code) => process.exit(code),
  (err) => {
    console.error('traceflow-export: fatal:', err);
    process.exit(1);
  },
);
