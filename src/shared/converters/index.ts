// Registry of export-format converters. The exporters builder replaces the
// individual converter modules below with real implementations; this index
// shape is the contract the worker's exporter imports.
import type { ExportFormatFlags, FormatConverter } from '../types';
import { anthropicConverter } from './anthropic';
import { openaiConverter } from './openai';
import { trajectoryConverter } from './trajectory';
import { universalConverter } from './universal';

export const converters: Record<keyof ExportFormatFlags, FormatConverter> = {
  anthropic: anthropicConverter,
  openai: openaiConverter,
  universal: universalConverter,
  trajectory: trajectoryConverter,
};
