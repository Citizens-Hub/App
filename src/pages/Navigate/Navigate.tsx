import { FormattedMessage } from 'react-intl';
import BackgroundVideo from '../../components/BackgroundVideo';
import { Link } from 'react-router';

export default function Navigate() {
  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto'>
      <BackgroundVideo />
      <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 gap-4 flex flex-col select-none drop-shadow-lg bg-gray-500/30 rounded-sm p-16 backdrop-blur-md'>
        {/* <div className='md:text-[72px] text-3xl font-bold text-white mix-blend-difference'>
          <FormattedMessage id="navigate.welcome" defaultMessage="Welcome Aboard" />
        </div>
        <div className='md:text-[96px] text-7xl font-bold text-blue-300'>
          <FormattedMessage id="navigate.title" defaultMessage="Citizens' Hub" />
        </div> */}
        <div className="text-center text-gray-100 text-sm sm:text-lg">
          <FormattedMessage id="navigate.welcome" defaultMessage="Welcome Aboard" />
        </div>
        <div className='text-center text-gray-100 text-lg sm:text-xl'>
          <FormattedMessage id="navigate.title" defaultMessage="Citizens' Hub" />
        </div>
        
        {/* 添加应用描述部分 */}
        <div className='text-center text-gray-100 text-sm sm:text-base max-w-2xl mx-auto mt-4'>
          <FormattedMessage 
            id="navigate.description" 
            defaultMessage="Your comprehensive Star Citizen companion app. Plan your CCU upgrades, preview store items, and manage your fleet with ease. Built by citizens, for citizens." 
          />
        </div>

        <div className='text-lg sm:text-3xl text-center text-gray-100 flex gap-2 m-auto text-nowrap mt-6'>
          <Link to="/ccu-planner" style={{ color: 'inherit' }}><FormattedMessage id="navigate.ccuPlanner" defaultMessage="CCU Planner" /></Link> |
          <Link to="/store-preview" style={{ color: 'inherit' }}><FormattedMessage id="navigate.storePreview" defaultMessage="Store Preview" /></Link>
        </div>
        <div className='text-xs sm:text-lg text-center text-gray-200 m-auto text-nowrap mt-4'>
          © {new Date().getFullYear()} <FormattedMessage id="navigate.title" defaultMessage="Star Citizen Tools" />
          &nbsp;|&nbsp;<Link to="/privacy" style={{ color: 'inherit' }}><FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" /></Link>
        </div>
      </div>
    </div>
  );
}
