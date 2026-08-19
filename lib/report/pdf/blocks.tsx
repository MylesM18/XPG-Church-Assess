import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { THEME_FILL } from '../charts';
import type { PunchListBlock, SectionBlock } from '../blocks';
import { FONT_BODY, FONT_DISPLAY } from './fonts';

/**
 * The PDF half of the BLOCK seam — the prose sibling of ./charts.tsx. Consumes the same
 * SectionBlock its web twin (app/app/[churchId]/diagnosis/report/blocks.tsx) does and composes no
 * sentence of its own: `head`, `line` and `note` are built once in lib/report/blocks.ts, so the
 * two surfaces cannot drift. Only layout lives here.
 *
 * Flowing <Text>, never <Svg>: SVG text cannot wrap, and the punch list is the one deterministic
 * part of the report whose length scales with the instrument (up to eight areas, each with its
 * own questions). A chart model could not carry it.
 */

const INK = '#1A1A18';
const INK_SOFT = '#5A5A54';
const RULE = '#D8D5CE';

const b = StyleSheet.create({
  area: { marginBottom: 10, borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 6 },
  head: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 11, color: INK, marginBottom: 3 },
  item: { paddingLeft: 12, fontSize: 9.5, marginBottom: 1 },
  itemTheme: { paddingLeft: 12, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7, letterSpacing: 1, marginBottom: 3 },
  note: { paddingLeft: 12, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: INK_SOFT },
});

function PdfPunchList({ model }: { model: PunchListBlock }) {
  return (
    <>
      {model.areas.map((area) => (
        <View key={area.category_id} style={b.area} wrap={false}>
          <Text style={b.head}>{area.head}</Text>
          {area.items.map((item) => (
            <View key={item.item_id}>
              <Text style={b.item}>{`•  ${item.line}`}</Text>
              <Text style={[b.itemTheme, { color: THEME_FILL[item.theme] }]}>{item.theme.toUpperCase()}</Text>
            </View>
          ))}
          {area.note !== null ? <Text style={b.note}>{area.note}</Text> : null}
        </View>
      ))}
    </>
  );
}

export function PdfBlock({ model }: { model: SectionBlock }) {
  switch (model.kind) {
    case 'punch_list':
      return <PdfPunchList model={model} />;
    default: {
      const _exhaustive: never = model.kind;
      return _exhaustive;
    }
  }
}
