import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * Promise-based replacement for the browser's native `confirm()`.
 *
 * Usage:
 *   const [confirm, confirmDialog] = useConfirm();
 *   ...
 *   if (!(await confirm({ title: '...', message: '...' }))) return;
 *   ...
 *   return <div>{confirmDialog}...</div>
 *
 * The returned `confirmDialog` element renders nothing until `confirm()` is
 * called, so it's safe to place once near the top of the component's JSX.
 */
export default function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    setOptions(opts);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  };

  const confirmDialog = options ? (
    <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return [confirm, confirmDialog];
}
