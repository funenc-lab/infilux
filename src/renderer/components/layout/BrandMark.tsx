import type { SVGProps } from 'react';

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5"
        fill="color-mix(in oklch, var(--background) 82%, var(--card) 18%)"
        stroke="color-mix(in oklch, var(--border) 74%, transparent)"
        strokeWidth="1.5"
      />
      <path
        d="M8 7.5h4.2c1.42 0 2.3.16 2.96.56a3.2 3.2 0 0 1 1.28 1.34c.34.68.46 1.58.46 3.1v3.9"
        stroke="color-mix(in oklch, var(--foreground) 84%, transparent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M9 16.5h6.25" stroke="var(--support)" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 11.1h5.4" stroke="var(--primary)" strokeLinecap="round" strokeWidth="2.2" />
      <circle
        cx="16.9"
        cy="16.4"
        r="2.1"
        fill="color-mix(in oklch, var(--primary) 76%, var(--support) 24%)"
      />
    </svg>
  );
}
