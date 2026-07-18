import path from 'node:path';
import { Font } from '@react-pdf/renderer';

/**
 * Brand fonts for PDF reports — static TrueType instances.
 *
 * These fonts are generated artifacts from OFL-licensed upstream sources.
 * For provenance, axis coordinates, and regeneration instructions, see:
 * `assets/fonts/GENERATION.md`
 */

export const FONT_DISPLAY = 'Fraunces';
export const FONT_BODY = 'HankenGrotesk';

const dir = path.join(process.cwd(), 'assets', 'fonts');

let registered = false;

/**
 * Idempotent. react-pdf's font store is module-global and a warm lambda reuses
 * it across requests, so registering twice is wasted work.
 */
export function registerReportFonts(): void {
  if (registered) return;

  Font.register({
    family: FONT_DISPLAY,
    fonts: [
      { src: path.join(dir, 'Fraunces-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'Fraunces-SemiBold.ttf'), fontWeight: 600 },
    ],
  });

  Font.register({
    family: FONT_BODY,
    fonts: [
      { src: path.join(dir, 'HankenGrotesk-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'HankenGrotesk-Bold.ttf'), fontWeight: 700 },
    ],
  });

  registered = true;
}
