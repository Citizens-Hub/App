import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { StarMapElement } from '@citizens-hub/starmap';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'citizenshub-star-map': DetailedHTMLProps<HTMLAttributes<StarMapElement>, StarMapElement> & {
        language?: 'en' | 'cn';
        src?: string;
        'show-orbits'?: string;
        'show-places'?: string;
        'show-rotation-axes'?: string;
        'system-id'?: string;
      };
    }
  }
}
