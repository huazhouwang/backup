import { useEffect, useState } from 'react';

/** Whether the window is phone-sized (below Tailwind's md breakpoint), following resizes */
export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 767px)');
    const f = () => setMobile(q.matches);
    f();
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  return mobile;
}
