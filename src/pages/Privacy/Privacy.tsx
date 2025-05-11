import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const Privacy: React.FC = () => {
  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Privacy Policy
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Introduction
        </Typography>
        <Typography component="p">
          This Privacy Policy describes how the Star Citizen CCU Planner extension ("we", "our", or "extension")
          collects, uses, and shares information about you when you use our browser extension.
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Information We Collect
        </Typography>
        <Typography component="p">
          Our extension only collects information necessary for its functionality:
        </Typography>
        <Typography component="ul" sx={{ pl: 4 }}>
          <li>Authentication tokens from robertsspaceindustries.com to enable access to your account data</li>
          <li>Information about your Star Citizen ships, upgrades, and hangar contents</li>
          <li>Extension preferences and settings you configure</li>
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          How We Use Your Information
        </Typography>
        <Typography component="p">
          We use the information we collect to:
        </Typography>
        <Typography component="ul" sx={{ pl: 4 }}>
          <li>Display your Star Citizen ships and upgrades</li>
          <li>Calculate optimal upgrade paths</li>
          <li>Save your preferences and settings</li>
        </Typography>
        <Typography component="p">
          All data is stored locally on your device. We do not transmit your data to our servers.
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Data Sharing
        </Typography>
        <Typography component="p">
          We do not share your personal information with third parties. The extension only communicates with
          robertsspaceindustries.com to retrieve your account data.
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Data Security
        </Typography>
        <Typography component="p">
          Your data is stored locally in your browser's storage. We implement reasonable security measures to
          protect your information, but no method of transmission or storage is 100% secure.
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Your Rights
        </Typography>
        <Typography component="p">
          You can clear all stored data by uninstalling the extension or clearing your browser's storage for this extension.
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Changes to This Privacy Policy
        </Typography>
        <Typography component="p">
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
          Privacy Policy in the extension. You are advised to review this Privacy Policy periodically for any changes.
        </Typography>

        <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
          Contact Us
        </Typography>
        <Typography component="p">
          If you have any questions about this Privacy Policy, please contact us through the extension's support channels.
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          Last updated: 2025-05-06
        </Typography>
      </Box>
    </Container>
  );
};

export default Privacy;

