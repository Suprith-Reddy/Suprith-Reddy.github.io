<script lang="ts">
  /**
   * ConfirmDelete — accessible confirm-before-delete dialog (T0.6).
   *
   * A thin, opinionated wrapper around `Dialog.svelte` for the destructive-action
   * pattern used by T1.1 (delete section) and T1.2 (delete card). The actual undo
   * affordance is a Toast (showToast with an "Undo" action) raised by the caller
   * AFTER confirm — this component only handles the confirmation step.
   *
   * Usage:
   *   <ConfirmDelete
   *     open={confirming}
   *     title="Delete section?"
   *     message={`"${name}" and its cards will be deleted.`}
   *     confirmLabel="Delete"
   *     onConfirm={doDelete}
   *     onCancel={() => (confirming = false)}
   *   />
   *
   * a11y (§3.5): inherits Dialog's focus trap + Esc + focus restore. The cancel
   * action is the default/safe path (Esc and backdrop both cancel). Buttons are
   * real <button>s ≥44×44 via the shared Button component; the danger styling is
   * paired with the explicit "Delete" text label (never color-alone).
   */
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';

  interface Props {
    open: boolean;
    /** Dialog heading, e.g. "Delete section?" */
    title: string;
    /** Body text describing what will be deleted. */
    message: string;
    /** Label for the destructive confirm button. Default "Delete". */
    confirmLabel?: string;
    /** Label for the safe cancel button. Default "Cancel". */
    cancelLabel?: string;
    /** Invoked when the user confirms the deletion. */
    onConfirm: () => void;
    /** Invoked when the user cancels (button, Esc, or backdrop). */
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel
  }: Props = $props();
</script>

<Dialog {open} {title} onClose={onCancel}>
  <p class="confirm-message">{message}</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={onCancel}>{cancelLabel}</Button>
    <Button variant="danger" onclick={onConfirm}>{confirmLabel}</Button>
  {/snippet}
</Dialog>

<style>
  .confirm-message {
    margin: 0;
    color: var(--color-text);
  }
</style>
