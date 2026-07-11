import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { RepoDataset } from '../core/schema';
import type { AnyParams, Recipe } from '../core/types';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../core/types';
import { renderFrame } from '../core/renderHost';
import { download, exportBasename } from './png';
import { exportFrames } from './frames';

/**
 * Encode the animation straight to an .mp4 in the browser via WebCodecs
 * (hardware H.264, no ffmpeg needed). Falls back to the PNG-frames zip on
 * browsers without VideoEncoder.
 */
export async function exportVideo(
  recipe: Recipe,
  data: RepoDataset,
  params: AnyParams,
  seed: number,
  durationS: number,
  fps = 30,
): Promise<void> {
  if (typeof VideoEncoder === 'undefined') {
    await exportFrames(recipe, data, params, seed, Math.round(durationS * fps));
    return;
  }

  const width = DESIGN_WIDTH; // 1500x2000 — even dimensions, H.264-safe
  const height = DESIGN_HEIGHT;
  const frameCount = Math.max(2, Math.round(durationS * fps));
  const canvas = new OffscreenCanvas(width, height);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({
    codec: 'avc1.640033', // High profile, level 5.1
    width,
    height,
    bitrate: 14_000_000,
    framerate: fps,
  });

  // eased timeline, mirroring playback
  const ease = (u: number) => u * u * (3 - 2 * u);
  for (let i = 0; i < frameCount; i++) {
    const t = ease(i / (frameCount - 1));
    renderFrame(canvas, recipe, data, params, seed, t);
    const frame = new VideoFrame(canvas, {
      timestamp: (i * 1e6) / fps,
      duration: 1e6 / fps,
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // let the encoder drain so memory stays flat
    if (encoder.encodeQueueSize > 4) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encoder.flush();
  muxer.finalize();

  download(
    new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    `${exportBasename(data.meta.name, recipe.id, seed)}.mp4`,
  );
}
