import { Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import ErrorsTable from './components/ErrorsTable';

enum Page {
  Errors = 'errors',
}

export default function Admin() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.Errors);

  return (
    <div className='absolute top-[65px] h-[calc(100vh-65px)] left-0 right-0 bottom-0 flex text-left flex-col md:flex-row justify-start'>
      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Errors ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.Errors)}>
          <FormattedMessage id="admin.errors" defaultMessage="Catched Errors" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="admin.erroesDescription" defaultMessage="View all catched errors" />
          </Typography>
        </div>
      </div>

      <div className='p-4 w-full h-[calc(100vh-128px-65px)] overflow-y-auto sm:mt-28'>
        {currentPage === Page.Errors && <ErrorsTable />}
      </div>
    </div>
  );
}
