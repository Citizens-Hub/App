import PolicyDocumentPage from '../../components/PolicyDocumentPage';

export default function Privacy() {
  return (
    <PolicyDocumentPage
      chineseDocPath="/docs/privacy.md"
      englishDocPath="/docs/privacy.en.md"
      panelPrefix="privacy"
      titleDefaultMessage="Privacy Policy"
      titleId="privacy.heading"
    />
  );
}
