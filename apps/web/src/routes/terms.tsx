import { createFileRoute } from '@tanstack/react-router';
import { ProsePage } from '@/features/site/Prose';
import { m } from '@/lib/i18n';

export const Route = createFileRoute('/terms')({
  component: () => (
    <ProsePage title={m.legal_terms_title()} updated={m.legal_updated()}>
      <p>{m.legal_terms_intro()}</p>
      <h2>{m.legal_terms_reference_heading()}</h2>
      <p>{m.legal_terms_reference_p()}</p>
      <h2>{m.legal_terms_content_heading()}</h2>
      <p>{m.legal_terms_content_p()}</p>
      <h2>{m.legal_terms_llm_heading()}</h2>
      <p>{m.legal_terms_llm_p()}</p>
      <h2>{m.legal_terms_use_heading()}</h2>
      <p>{m.legal_terms_use_p()}</p>
      <h2>{m.legal_terms_changes_heading()}</h2>
      <p>{m.legal_terms_changes_p()}</p>
    </ProsePage>
  ),
});
