import PolicyDocumentPage from '../../components/PolicyDocumentPage';

export default function TermsOfService() {
  return (
    <PolicyDocumentPage
      chineseDocPath="/docs/terms.md"
      englishDocPath="/docs/terms.en.md"
      panelPrefix="terms"
      titleDefaultMessage="Terms of Service"
      titleId="terms.heading"
    />
  );
}
