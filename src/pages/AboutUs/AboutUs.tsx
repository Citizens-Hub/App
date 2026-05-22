import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { Box, Button, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router';

const BUSINESS_REGISTRATION_IMAGE_URL = 'https://r2.citizenshub.app/br.png';
const DISCORD_URL = 'https://discord.gg/AEuRtb5Vy8';

const featureCards = [
  {
    icon: DashboardCustomizeOutlinedIcon,
    titleId: 'about.feature.tools.title',
    titleDefault: 'Free tools first',
    bodyId: 'about.feature.tools.body',
    bodyDefault: 'Citizens\' Hub started as a free Star Citizen tool site. CCU planning, price history, hangar tools, and order tracking are here to help you make a better decision before spending money.',
  },
  {
    icon: ShieldOutlinedIcon,
    titleId: 'about.feature.stock.title',
    titleDefault: 'Self-operated stock',
    bodyId: 'about.feature.stock.body',
    bodyDefault: 'When we list ships or CCUs for sale, they come from our own stock. We are not matching you with an unknown outside seller.',
  },
  {
    icon: LocalShippingOutlinedIcon,
    titleId: 'about.feature.delivery.title',
    titleDefault: '24-hour delivery',
    bodyId: 'about.feature.delivery.body',
    bodyDefault: 'We guarantee delivery within 24 hours. When we are online, orders are often handled much faster.',
  },
  {
    icon: SupportAgentOutlinedIcon,
    titleId: 'about.feature.support.title',
    titleDefault: 'Talk to us directly',
    bodyId: 'about.feature.support.body',
    bodyDefault: 'If you want to ask before buying or need help after payment, you can reach us through Discord or support tickets.',
  },
] as const;

function renderSupportMessage(bodyId: string, defaultMessage: string) {
  return (
    <FormattedMessage
      id={bodyId}
      defaultMessage={defaultMessage}
      values={{
        discord: (chunks: ReactNode) => (
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 transition hover:text-slate-950 dark:hover:text-white"
          >
            {chunks}
          </a>
        ),
        ticket: (chunks: ReactNode) => (
          <RouterLink
            to="/tickets"
            className="underline underline-offset-4 transition hover:text-slate-950 dark:hover:text-white"
          >
            {chunks}
          </RouterLink>
        ),
      }}
    />
  );
}

export default function AboutUs() {
  const intl = useIntl();
  const businessRegistrationAlt = intl.formatMessage({
    id: 'about.registration.previewAlt',
    defaultMessage: 'Business registration document for PARAVIA LIMITED',
  });

  return (
    <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-slate-50 text-left text-slate-950 dark:bg-[#121212] dark:text-slate-100">
      <Helmet>
        <title>About Us | Citizens' Hub</title>
        <meta
          name="description"
          content={intl.formatMessage({
            id: 'about.metaDescription',
            defaultMessage: 'Citizens\' Hub is a free Star Citizen tool site with self-operated ships and CCUs available for purchase.',
          })}
        />
      </Helmet>

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 md:gap-6 md:px-8 md:py-8">
        <section>
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              backgroundColor: 'background.paper',
              p: { xs: 3, md: 5 },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                mb: 1.5,
              }}
            >
              <FormattedMessage id="about.hero.eyebrow" defaultMessage="About Citizens' Hub" />
            </Typography>

            <Typography
              variant="h3"
              component="h1"
              sx={{
                maxWidth: 760,
                fontSize: { xs: '2.1rem', md: '3rem' },
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: 0,
              }}
            >
              <FormattedMessage
                id="about.hero.title"
                defaultMessage="A free Star Citizen tool site, with self-operated ships and CCUs available."
              />
            </Typography>

            <Box sx={{ mt: 3, maxWidth: 760 }}>
              <Typography sx={{ lineHeight: 1.9, color: 'text.secondary' }}>
                <FormattedMessage
                  id="about.hero.body1"
                  defaultMessage="Citizens' Hub is a free Star Citizen tool site. We also provide self-operated ships and CCUs for players who want to save time and money."
                />
              </Typography>
              <Typography sx={{ mt: 1.5, lineHeight: 1.9, color: 'text.secondary' }}>
                <FormattedMessage
                  id="about.hero.body2"
                  defaultMessage="Use the tools to plan your fleet, compare upgrade paths, and check prices. If you decide to buy from us, the items listed in our market are handled by us directly."
                />
              </Typography>
            </Box>

            <Box sx={{ mt: 3.5, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                component={RouterLink}
                to="/market"
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                sx={{
                  minHeight: 44,
                  width: { xs: '100%', sm: 'auto' },
                  textTransform: 'none',
                  boxShadow: 'none',
                }}
              >
                <FormattedMessage id="about.hero.primaryCta" defaultMessage="Browse Market" />
              </Button>
              <Button
                component={RouterLink}
                to="/ccu-planner"
                variant="outlined"
                sx={{
                  minHeight: 44,
                  width: { xs: '100%', sm: 'auto' },
                  textTransform: 'none',
                }}
              >
                <FormattedMessage id="about.hero.secondaryCta" defaultMessage="Open CCU Planner" />
              </Button>
            </Box>
          </Box>
        </section>

        <section className="grid gap-3 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
          <div className="py-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              <FormattedMessage id="about.section.capabilities" defaultMessage="Services We Provide" />
            </div>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-slate-950 dark:text-slate-50">
              <FormattedMessage
                id="about.section.capabilitiesTitle"
                defaultMessage="Tools are free. Market items are self-operated."
              />
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              <FormattedMessage
                id="about.section.capabilitiesDescription"
                defaultMessage="We keep the tools and the store in one place because they serve the same goal: helping you spend less time guessing and more time making the right choice."
              />
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <Box
                  key={card.titleId}
                  sx={{
                    backgroundColor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2.5,
                    minHeight: 230,
                  }}
                >
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 42,
                      height: 42,
                      border: '1px solid',
                      borderColor: (theme) => (theme.palette.mode === 'dark' ? alpha('#ffffff', 0.14) : alpha('#0f172a', 0.12)),
                      backgroundColor: (theme) => (theme.palette.mode === 'dark' ? alpha('#ffffff', 0.05) : alpha('#0f172a', 0.04)),
                      color: 'text.primary',
                    }}
                  >
                    <Icon fontSize="small" />
                  </Box>
                  <Typography variant="h6" component="h3" sx={{ mt: 2, fontSize: '1rem', fontWeight: 800, lineHeight: 1.35 }}>
                    <FormattedMessage id={card.titleId} defaultMessage={card.titleDefault} />
                  </Typography>
                  <Typography sx={{ mt: 1.25, lineHeight: 1.75, color: 'text.secondary', fontSize: '0.92rem' }}>
                    {card.titleId === 'about.feature.support.title'
                      ? renderSupportMessage(card.bodyId, card.bodyDefault)
                      : <FormattedMessage id={card.bodyId} defaultMessage={card.bodyDefault} />}
                  </Typography>
                </Box>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 pb-2 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              <FormattedMessage id="about.registration.eyebrow" defaultMessage="Business registration" />
            </div>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-slate-950 dark:text-slate-50">
              <FormattedMessage id="about.registration.title" defaultMessage="You can check the company behind the store." />
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              <FormattedMessage
                id="about.registration.linkDescription"
                defaultMessage="Citizens' Hub is operated by PARAVIA LIMITED. We keep the business registration document here for you to check."
              />
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              <FormattedMessage
                id="about.registration.description"
                defaultMessage="It does not replace actual service, but you should not have to guess who is behind the storefront."
              />
            </p>

            <Box sx={{ mt: 3 }}>
              <Button
                component="a"
                href={BUSINESS_REGISTRATION_IMAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                endIcon={<OpenInNewIcon />}
                sx={{
                  minHeight: 44,
                  width: { xs: '100%', sm: 'auto' },
                  textTransform: 'none',
                }}
              >
                <FormattedMessage
                  id="about.registration.button"
                  defaultMessage="View Business Registration"
                />
              </Button>
            </Box>
          </div>

          <Box
            component="a"
            href={BUSINESS_REGISTRATION_IMAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'block',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              backgroundColor: 'background.paper',
              aspectRatio: '4 / 3',
              textDecoration: 'none',
            }}
          >
            <Box
              component="img"
              src={BUSINESS_REGISTRATION_IMAGE_URL}
              alt={businessRegistrationAlt}
              loading="lazy"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top center',
                display: 'block',
                filter: (theme) => (theme.palette.mode === 'dark' ? 'brightness(0.92)' : 'none'),
              }}
            />
          </Box>
        </section>
      </main>
    </div>
  );
}
