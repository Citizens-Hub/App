import { FormattedMessage } from 'react-intl';
import BackgroundVideo from '@/components/BackgroundVideo';
import { Link } from 'react-router';

export default function Navigate() {
  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto'>
      <BackgroundVideo />
      <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 gap-4 flex flex-col select-none drop-shadow-lg bg-gray-500/30 rounded-sm p-16 backdrop-blur-md md:px-48'>
        <div className="text-center text-gray-100 text-sm sm:text-lg">
          <FormattedMessage id="navigate.welcome" defaultMessage="Welcome Aboard" />
        </div>
        <div className='text-center text-gray-100 text-2xl lg:text-[48px]'>
          <FormattedMessage id="navigate.title" defaultMessage="Citizens' Hub" />
        </div>

        <div className='text-center text-gray-100 text-lg max-w-2xl mx-auto mt-4'>
          <FormattedMessage
            id="navigate.description"
            defaultMessage="Plan your CCU upgrades, preview store items, and manage your fleet with ease."
          />
        </div>

        <div className='text-lg sm:text-3xl text-center text-gray-100 flex gap-2 m-auto text-nowrap mt-6'>
          <Link to="/ccu-planner" style={{ color: 'inherit' }}>
            <FormattedMessage id="navigate.ccuPlanner" defaultMessage="CCU Planner" />
          </Link>
          <span>|</span>
          <Link to="/store-preview" style={{ color: 'inherit' }}>
            <FormattedMessage id="navigate.storePreview" defaultMessage="Store Preview" />
          </Link>
        </div>

        <div className='text-xs sm:text-lg text-center text-gray-200 m-auto text-nowrap mt-4'>
          <span>© {new Date().getFullYear()} </span>
          <span><FormattedMessage id="navigate.title" defaultMessage="Star Citizen Tools" /></span>
          <span>&nbsp;|&nbsp;</span>
          <Link to="/privacy" style={{ color: 'inherit' }}>
            <FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" />
          </Link>
          <span>&nbsp;|&nbsp;</span>
          <Link to="/terms-of-service" style={{ color: 'inherit' }}>
            <FormattedMessage id="navigate.terms" defaultMessage="Terms of Service" />
          </Link>
          <span>&nbsp;|&nbsp;</span>
          <Link to="/refund-policy" style={{ color: 'inherit' }}>
            <FormattedMessage id="navigate.refund" defaultMessage="Refund Policy" />
          </Link>
        </div>
      </div>
    </div>
  );
}
