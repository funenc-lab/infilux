import { describe, expect, it } from 'vitest';
import {
  fadeVariants,
  getSlideVariants,
  hoverScale,
  iconButtonHover,
  listContainerVariants,
  listItemVariants,
  panelTransition,
  scaleInVariants,
  slideDownVariants,
  slideLeftVariants,
  slideRightVariants,
  slideUpVariants,
  springFast,
  springGentle,
  springStandard,
  tapScale,
  transitionFast,
  widthVariants,
} from '../motion';

describe('motion', () => {
  it('exports stable animation presets', () => {
    expect(springFast).toEqual({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });
    expect(springStandard).toEqual({
      type: 'spring',
      stiffness: 400,
      damping: 30,
    });
    expect(springGentle).toEqual({
      type: 'spring',
      stiffness: 300,
      damping: 25,
    });
    expect(transitionFast).toEqual({
      duration: 0.15,
      ease: 'easeOut',
    });
    expect(panelTransition).toBe(springStandard);
  });

  it('exports stable shared variants and micro-interactions', () => {
    expect(fadeVariants).toEqual({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    });
    expect(scaleInVariants).toEqual({
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
    });
    expect(widthVariants).toEqual({
      initial: { width: 0, opacity: 0 },
      animate: { width: 'auto', opacity: 1 },
      exit: { width: 0, opacity: 0 },
    });
    expect(listContainerVariants).toEqual({
      initial: { opacity: 0 },
      animate: {
        opacity: 1,
        transition: {
          staggerChildren: 0.03,
        },
      },
      exit: { opacity: 0 },
    });
    expect(listItemVariants).toEqual({
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
    });
    expect(tapScale).toEqual({ scale: 0.97 });
    expect(hoverScale).toEqual({ scale: 1.02 });
    expect(iconButtonHover).toEqual({ scale: 1.1 });
  });

  it('returns the expected slide variants for each direction', () => {
    expect(getSlideVariants('up')).toBe(slideUpVariants);
    expect(getSlideVariants('down')).toBe(slideDownVariants);
    expect(getSlideVariants('left')).toBe(slideLeftVariants);
    expect(getSlideVariants('right')).toBe(slideRightVariants);
  });
});
