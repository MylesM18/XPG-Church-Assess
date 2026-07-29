/**
 * The booking call-to-action — one shared source of truth rendered identically on all three
 * report surfaces (screen, PDF, public /r/[shareToken] share link), spec §5. Kept as a plain
 * constant so the screen `<a>`, the react-pdf `<Link>`, and the shared surface cannot drift on
 * the URL or the copy. Placed after the dynamic NextStep and before the Appendix (Layer 4).
 */
export const bookingCta = {
  url: 'https://api.leadconnectorhq.com/widget/bookings/xpgatheringdiscovery',
  heading: 'Take the next step',
  body:
    'You’ve seen where your church is strong and where the real constraint is. The fastest ' +
    'way to turn this into a plan is a conversation. Book a free call with the XP Gathering ' +
    'team — we’ll walk through your results together and map the next few moves for your ' +
    'church. No cost, no pressure.',
  buttonLabel: 'Book your free call →',
} as const
