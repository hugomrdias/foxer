/**
 * Public COPY façade — re-exports the production entry points and config constants.
 */
export {
  DEFAULT_COPY_CHUNK_BYTES,
  MAX_COPY_CHUNK_BYTES,
  MIN_COPY_CHUNK_BYTES,
} from './copy/constants.ts'
export { type CopyMetrics, copyIndexedBlockData } from './copy/writer.ts'
