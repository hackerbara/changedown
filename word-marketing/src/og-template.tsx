/**
 * OG card template for build-time Satori generation.
 * Returns a JSX-like tree (objects, not React elements) that Satori
 * accepts. Output is 1200×630 PNG.
 *
 * Style: cream background, Source Serif 4 headline, copper accent bar,
 * 'changedown.com' wordmark.
 */
export function ogTemplate(title: string, subtitle = 'ChangeDown for Word') {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        background: '#f6f1e8',
        padding: '80px',
        justifyContent: 'space-between',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontSize: 22,
              color: '#8a7a5a',
              fontFamily: 'Source Sans 3',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            },
            children: subtitle,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: 72,
              color: '#2a2823',
              fontFamily: 'Source Serif 4',
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              maxWidth: '900px',
            },
            children: title,
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: 16 },
            children: [
              {
                type: 'div',
                props: {
                  style: { width: 4, height: 40, background: '#8a5a1a' },
                  children: '',
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: 18, color: '#5a4a30', fontFamily: 'Source Sans 3' },
                  children: 'changedown.com',
                },
              },
            ],
          },
        },
      ],
    },
  };
}
