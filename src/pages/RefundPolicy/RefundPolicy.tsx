import PolicyDocumentPage from '../../components/PolicyDocumentPage';

export default function RefundPolicy() {
  return (
    <PolicyDocumentPage
      chineseDocPath="/docs/refund-policy.md"
      englishDocPath="/docs/refund-policy.en.md"
      panelPrefix="refund"
      titleDefaultMessage="Refund Policy"
      titleId="refund.heading"
    />
  );
}
