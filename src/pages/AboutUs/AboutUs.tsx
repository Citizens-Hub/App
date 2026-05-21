import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import { Box, Button, Typography } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { Helmet } from 'react-helmet';
import { Link as RouterLink } from 'react-router';

const BUSINESS_REGISTRATION_IMAGE_URL = 'https://r2.citizenshub.app/br.png';
const DISCORD_URL = 'https://discord.gg/AEuRtb5Vy8';

const featureCards = [
  {
    icon: ShieldOutlinedIcon,
    titleId: 'about.feature.stock.title',
    titleDefault: 'Own-stock marketplace',
    bodyId: 'about.feature.stock.body',
    bodyDefault: 'All items come directly from our own stock, with no third-party sellers involved, and are covered by our customer protection policy.',
  },
  {
    icon: SupportAgentOutlinedIcon,
    titleId: 'about.feature.support.title',
    titleDefault: 'Direct support',
    bodyId: 'about.feature.support.body',
    bodyDefault: 'If you need updates or help with an order, you can reach us through Discord or continue the conversation through support tickets.',
  },
  {
    icon: LocalShippingOutlinedIcon,
    titleId: 'about.feature.delivery.title',
    titleDefault: 'Clear delivery expectations',
    bodyId: 'about.feature.delivery.body',
    bodyDefault: 'We guarantee delivery within 24 hours, and when we are online we can usually move much faster.',
  },
  {
    icon: DashboardCustomizeOutlinedIcon,
    titleId: 'about.feature.tools.title',
    titleDefault: 'Practical player tools',
    bodyId: 'about.feature.tools.body',
    bodyDefault: 'Citizens\' Hub combines market browsing, CCU planning, order tracking, and support workflows in one place.',
  },
] as const;

export default function AboutUs() {
  const intl = useIntl();

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto text-left'>
      <Helmet>
        <title>About Us | Citizens' Hub</title>
        <meta
          name="description"
          content={intl.formatMessage({
            id: 'about.metaDescription',
            defaultMessage: 'Learn why players use Citizens\' Hub, what this storefront offers, and view the business registration document for the operating company PARAVIA LIMITED.',
          })}
        />
      </Helmet>

      <Box sx={{ maxWidth: '920px', margin: '0 auto' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          <FormattedMessage id="about.heading" defaultMessage="About Us" />
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 4 }}>
          <FormattedMessage
            id="about.subtitle"
            defaultMessage="A Star Citizen marketplace and toolkit built around own-stock listings, direct support, and practical buying workflows."
          />
        </Typography>

        <Box
          sx={{
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: { xs: 3, md: 4 },
          }}
        >
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              mb: 1.5,
            }}
          >
            <FormattedMessage id="about.hero.eyebrow" defaultMessage="Why Citizens' Hub" />
          </Typography>

          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
            <FormattedMessage
              id="about.hero.title"
              defaultMessage="More than a storefront for buying Star Citizen digital items."
            />
          </Typography>

          <Typography sx={{ mt: 2, lineHeight: 1.9, color: 'text.secondary' }}>
            <FormattedMessage
              id="about.hero.body1"
              defaultMessage="Citizens' Hub is built for players who want a clearer way to browse listings, place orders, follow fulfillment, and get support when something needs attention."
            />
          </Typography>
          <Typography sx={{ mt: 2, lineHeight: 1.9, color: 'text.secondary' }}>
            <FormattedMessage
              id="about.hero.body2"
              defaultMessage="Alongside the marketplace itself, Citizens' Hub also brings together CCU planning, order tracking, and support workflows in one place."
            />
          </Typography>

          <Box sx={{ mt: 3, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              component={RouterLink}
              to="/market"
              variant="contained"
              sx={{ textTransform: 'none', boxShadow: 'none' }}
            >
              <FormattedMessage id="about.hero.primaryCta" defaultMessage="Browse Market" />
            </Button>
            <Button
              component="a"
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              sx={{ textTransform: 'none' }}
            >
              <FormattedMessage id="about.hero.secondaryCta" defaultMessage="Join Discord" />
            </Button>
          </Box>
        </Box>

        <div className='mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
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
                  p: 3,
                  height: '100%',
                }}
              >
                <Icon sx={{ color: 'text.secondary', mb: 1.5 }} />
                <Typography variant="h6" component="h3" sx={{ fontSize: '1rem', fontWeight: 700 }}>
                  <FormattedMessage id={card.titleId} defaultMessage={card.titleDefault} />
                </Typography>
                <Typography sx={{ mt: 1.5, lineHeight: 1.8, color: 'text.secondary', fontSize: '0.95rem' }}>
                  {card.titleId === 'about.feature.support.title' ? (
                    <FormattedMessage
                      id={card.bodyId}
                      defaultMessage={card.bodyDefault}
                      values={{
                        discord: (chunks: React.ReactNode) => (
                          <a
                            href={DISCORD_URL}
                            target="_blank"
                            rel="noreferrer"
                            className='underline underline-offset-4'
                          >
                            {chunks}
                          </a>
                        ),
                        ticket: (chunks: React.ReactNode) => (
                          <RouterLink to="/tickets" className='underline underline-offset-4'>
                            {chunks}
                          </RouterLink>
                        ),
                      }}
                    />
                  ) : (
                    <FormattedMessage id={card.bodyId} defaultMessage={card.bodyDefault} />
                  )}
                </Typography>
              </Box>
            );
          })}
        </div>

        <Box
          sx={{
            mt: 3,
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: { xs: 3, md: 4 },
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            <FormattedMessage id="about.section.registration" defaultMessage="Business Registration" />
          </Typography>

          <Typography sx={{ lineHeight: 1.9, color: 'text.secondary' }}>
            <FormattedMessage
              id="about.registration.linkDescription"
              defaultMessage="View the business registration document for the operating company PARAVIA LIMITED."
            />
          </Typography>

          <Box sx={{ mt: 3 }}>
            <Button
              component="a"
              href={BUSINESS_REGISTRATION_IMAGE_URL}
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              sx={{ textTransform: 'none' }}
            >
              <FormattedMessage
                id="about.registration.button"
                defaultMessage="View Business Registration"
              />
            </Button>
          </Box>
        </Box>
      </Box>
    </div>
  );
}
