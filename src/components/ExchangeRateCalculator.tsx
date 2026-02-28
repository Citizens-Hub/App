import { ReactNode, useEffect, useRef, useState } from 'react';
import { SwapHoriz } from '@mui/icons-material';
import {
  Box,
  ClickAwayListener,
  Grow,
  IconButton,
  Paper,
  Popper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useIntl } from 'react-intl';

interface ExchangeRateCalculatorProps {
  currency: string;
  exchangeRate?: number;
  trigger?: ReactNode;
}

const sanitizeNumericInput = (value: string): string => {
  const sanitized = value.replace(/[^0-9.]/g, '');
  if (!sanitized) return '';

  const firstDotIndex = sanitized.indexOf('.');
  if (firstDotIndex === -1) {
    return sanitized;
  }

  return `${sanitized.slice(0, firstDotIndex + 1)}${sanitized.slice(firstDotIndex + 1).replace(/\./g, '')}`;
};

const toNumber = (value: string): number => {
  if (!value || value === '.') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toEditableNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(6).replace(/\.?0+$/, '');
};

export default function ExchangeRateCalculator({ currency, exchangeRate = 0, trigger }: ExchangeRateCalculatorProps) {
  const intl = useIntl();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [usdInput, setUsdInput] = useState('100');
  const [targetInput, setTargetInput] = useState('');
  const [lastEditedField, setLastEditedField] = useState<'usd' | 'target'>('usd');

  const normalizedCurrency = currency.toUpperCase();
  const hasValidRate = Number.isFinite(exchangeRate) && exchangeRate > 0;

  useEffect(() => {
    if (!hasValidRate) {
      return;
    }

    if (lastEditedField === 'usd') {
      if (usdInput === '' || usdInput === '.') {
        if (targetInput !== '') {
          setTargetInput('');
        }
        return;
      }

      const convertedTarget = toEditableNumber(toNumber(usdInput) * exchangeRate);
      if (targetInput !== convertedTarget) {
        setTargetInput(convertedTarget);
      }
      return;
    }

    if (targetInput === '' || targetInput === '.') {
      if (usdInput !== '') {
        setUsdInput('');
      }
      return;
    }

    const convertedUsd = toEditableNumber(toNumber(targetInput) / exchangeRate);
    if (usdInput !== convertedUsd) {
      setUsdInput(convertedUsd);
    }
  }, [exchangeRate, hasValidRate, lastEditedField, targetInput, usdInput]);

  const handleUsdChange = (value: string) => {
    setLastEditedField('usd');
    setUsdInput(sanitizeNumericInput(value));
  };

  const handleTargetChange = (value: string) => {
    setLastEditedField('target');
    setTargetInput(sanitizeNumericInput(value));
  };

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <span
        ref={anchorRef}
        className="inline-flex"
        onClick={() => setOpen(open ? false : true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        {trigger || (
          <Tooltip title={intl.formatMessage({ id: 'exchangeCalculator.tooltip', defaultMessage: 'Open exchange rate calculator' })}>
            <IconButton
              color="inherit"
              aria-label={intl.formatMessage({ id: 'exchangeCalculator.tooltip', defaultMessage: 'Open exchange rate calculator' })}
            >
              <SwapHoriz />
            </IconButton>
          </Tooltip>
        )}
      </span>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        transition
        modifiers={[{ name: 'offset', options: { offset: [0, 10] } }]}
        sx={{ zIndex: 1200 }}
      >
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} timeout={160}>
            <Paper
              elevation={8}
              sx={{
                p: 2,
                width: 320,
                maxWidth: 'calc(100vw - 24px)',
                borderRadius: 2
              }}
            >
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {intl.formatMessage({ id: 'exchangeCalculator.title', defaultMessage: 'Exchange Rate Calculator' })}
                  </Typography>
                  {hasValidRate ? (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        {intl.formatMessage(
                          { id: 'exchangeCalculator.rate', defaultMessage: '1 USD = {rate} {currency}' },
                          {
                            rate: exchangeRate.toLocaleString(intl.locale, { maximumFractionDigits: 6 }),
                            currency: normalizedCurrency
                          }
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {intl.formatMessage(
                          { id: 'exchangeCalculator.inverseRate', defaultMessage: '1 {currency} = {rate} USD' },
                          {
                            currency: normalizedCurrency,
                            rate: (1 / exchangeRate).toLocaleString(intl.locale, { maximumFractionDigits: 6 })
                          }
                        )}
                      </Typography>
                      <TextField
                        size="small"
                        label={intl.formatMessage({ id: 'exchangeCalculator.usdAmount', defaultMessage: 'Amount (USD)' })}
                        value={usdInput}
                        onChange={(event) => handleUsdChange(event.target.value)}
                        fullWidth
                      />
                      <TextField
                        size="small"
                        label={intl.formatMessage(
                          { id: 'exchangeCalculator.localAmount', defaultMessage: 'Amount ({currency})' },
                          { currency: normalizedCurrency }
                        )}
                        value={targetInput}
                        onChange={(event) => handleTargetChange(event.target.value)}
                        fullWidth
                      />
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {intl.formatMessage({
                        id: 'exchangeCalculator.rateUnavailable',
                        defaultMessage: 'Exchange rate is currently unavailable.'
                      })}
                    </Typography>
                  )}
                </Box>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </Box>
  );
}
