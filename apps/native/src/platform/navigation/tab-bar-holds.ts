/**
 * Counts the layers that cover the tab bar. Each `hold` must be released once; the bar is hidden
 * while any hold is open, so a form closing over a picker does not show the bar under the picker.
 */
export function createTabBarHolds(onChange: (hidden: boolean) => void) {
  let count = 0;
  return {
    hold(): () => void {
      count += 1;
      if (count === 1) onChange(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        count -= 1;
        if (count === 0) onChange(false);
      };
    },
  };
}
