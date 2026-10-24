import { createFileRoute } from '@tanstack/react-router';
import { ProsePage } from '@/features/site/Prose';
import { m } from '@/lib/i18n';

export const Route = createFileRoute('/privacy')({
  component: () => (
    <ProsePage title={m.legal_privacy_title()} updated={m.legal_updated()}>
      <p>{m.legal_privacy_intro()}</p>
      <h2>{m.legal_privacy_data_heading()}</h2>
      <ul>
        <li>{m.legal_privacy_data_account()}</li>
        <li>{m.legal_privacy_data_projects()}</li>
        <li>{m.legal_privacy_data_keys()}</li>
        <li>{m.legal_privacy_data_usage()}</li>
        <li>{m.legal_privacy_data_logs()}</li>
      </ul>
      <h2>{m.legal_privacy_flow_heading()}</h2>
      <ul>
        <li>{m.legal_privacy_flow_llm()}</li>
        <li>{m.legal_privacy_flow_hosting()}</li>
        <li>{m.legal_privacy_flow_no_sale()}</li>
      </ul>
      <h2>{m.legal_privacy_rights_heading()}</h2>
      <ul>
        <li>{m.legal_privacy_rights_export()}</li>
        <li>{m.legal_privacy_rights_owner()}</li>
      </ul>
    </ProsePage>
  ),
});
