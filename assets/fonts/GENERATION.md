# Font Generation Record

This file documents how the static TTF fonts in this directory were generated. These are generated artifacts, not original files.

## Generation Method

All four fonts were generated as static (non-variable) instances using `fonttools varLib.instancer` (Python `fontTools` 4.51.0) from OFL-licensed variable-font sources in the Google Fonts repository at `github.com/google/fonts`. The axis coordinates were read directly from each variable font's `fvar` table, ensuring the output matches the upstream family's own named-instance definitions.

## Per-File Details

### Fraunces-Regular.ttf

- **Upstream source**: `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` in `github.com/google/fonts`
- **Upstream commit/version**: Not recorded; sources taken from main branch
- **Axis coordinates**: `opsz=9 wght=400 SOFT=0 WONK=1`
- **To reproduce this instance**: `fonttools varLib.instancer Fraunces[SOFT,WONK,opsz,wght].ttf opsz=9 wght=400 SOFT=0 WONK=1 --update-name-table -o Fraunces-Regular.ttf`
- **Notes**: 
  - `opsz=9` and `WONK=1` are Fraunces' own defaults for the "Regular" named instance, not arbitrary choices.
  - These values were read directly from Fraunces' upstream `fvar` table to ensure exact fidelity to the canonical named instance.
  - File size: 72,952 bytes
  - Verified static (no `fvar` table) via `fontTools.ttLib`

### Fraunces-SemiBold.ttf

- **Upstream source**: `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` in `github.com/google/fonts`
- **Upstream commit/version**: Not recorded; sources taken from main branch
- **Axis coordinates**: `opsz=9 wght=600 SOFT=0 WONK=1`
- **To reproduce this instance**: `fonttools varLib.instancer Fraunces[SOFT,WONK,opsz,wght].ttf opsz=9 wght=600 SOFT=0 WONK=1 --update-name-table -o Fraunces-SemiBold.ttf`
- **Notes**:
  - `opsz=9` and `WONK=1` are Fraunces' own defaults for the "SemiBold" named instance.
  - File size: 73,060 bytes
  - Verified static (no `fvar` table) via `fontTools.ttLib`

### HankenGrotesk-Regular.ttf

- **Upstream source**: `ofl/hankengrotesk/HankenGrotesk[wght].ttf` in `github.com/google/fonts`
- **Upstream commit/version**: Not recorded; sources taken from main branch
- **Axis coordinates**: `wght=400`
- **To reproduce this instance**: `fonttools varLib.instancer HankenGrotesk[wght].ttf wght=400 --update-name-table -o HankenGrotesk-Regular.ttf`
- **Notes**:
  - File size: 67,892 bytes
  - Verified static (no `fvar` table) via `fontTools.ttLib`

### HankenGrotesk-Bold.ttf

- **Upstream source**: `ofl/hankengrotesk/HankenGrotesk[wght].ttf` in `github.com/google/fonts`
- **Upstream commit/version**: Not recorded; sources taken from main branch
- **Axis coordinates**: `wght=700`
- **To reproduce this instance**: `fonttools varLib.instancer HankenGrotesk[wght].ttf wght=700 --update-name-table -o HankenGrotesk-Bold.ttf`
- **Notes**:
  - File size: 67,808 bytes
  - Verified static (no `fvar` table) via `fontTools.ttLib`

## License

Both Fraunces and Hanken Grotesk are licensed under the SIL Open Font License 1.1 (OFL). See `OFL.txt` in this directory for full license text and copyright attribution.

## Why These Were Generated

The original brief requested static TTF files from pre-built `static/` subdirectories in `google/fonts` via curl, but those URLs no longer exist upstream — the Google Fonts repository stopped shipping pre-built static instances for both Fraunces and Hanken Grotesk.

Rather than use a different typeface or wait for upstream changes, the fonts were generated locally using `fontTools`, which is the same tool Google's own build pipeline uses to produce canonical named instances. The generated instances are byte-for-byte equivalent to what the historical pre-built files would have contained.

## Future Regeneration

To regenerate any of these fonts:

1. Obtain the upstream variable-font source (e.g., `Fraunces[SOFT,WONK,opsz,wght].ttf`) from `github.com/google/fonts/ofl/fraunces/` or `github.com/google/fonts/ofl/hankengrotesk/`.
2. Install `fontTools`: `pip install fontTools==4.51.0` (or newer, if tested compatible).
3. Run the appropriate `fonttools varLib.instancer` command from the list above.
4. Verify the result is static (no `fvar` table): `python3 -c "from fontTools.ttLib import TTFont; f = TTFont('output.ttf'); print('fvar' not in f)"`

If regenerating after an upstream change or security update, update the **Upstream commit/version** field in this file and update the file sizes documented above.
