import { Box, Button, Rating, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import star from '@/assets/ship-photos/star.svg';
import emptyStar from '@/assets/ship-photos/star-empty.svg';
import largeStar from '@/assets/ship-photos/star-large.svg';
import largeEmptyStar from '@/assets/ship-photos/star-empty-large.svg';
export default function PhotoRating({ value, onChange, disabled }: { value?: number | null; onChange?: (value: number | null) => void; disabled?: boolean }) {
  const intl = useIntl();
  const ratingMessageId = 'shipPhotos.rating' + value;
  const size = onChange ? 32 : 20;
  if (!onChange && !value) return null;
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
    <Rating value={value ?? null} readOnly={!onChange} disabled={disabled} onChange={(_, next) => onChange?.(next)}
      getLabelText={rating => intl.formatMessage({ id: 'shipPhotos.ratingLabel' }, { rating })}
      icon={<img src={onChange ? largeStar : star} alt="" width={size} height={size} />}
      emptyIcon={<img src={onChange ? largeEmptyStar : emptyStar} alt="" width={size} height={size} />}
      sx={{ flexShrink: 0, '& .MuiRating-icon': { width: size, height: size, flexShrink: 0 }, gap: onChange ? { xs: 0, sm: 1 } : '6px', '& label': onChange ? { minHeight: 44, minWidth: 44, justifyContent: 'center', display: 'flex', alignItems: 'center' } : {},
        // MUI's empty-value radio is not a sixth star. Keep it accessible but
        // outside the flex row so pointer math measures only the five stars.
        '& label:has(input[value=""])': onChange ? { position: 'absolute', width: 1, height: 1, minWidth: 0, minHeight: 0, padding: 0, margin: 0, overflow: 'hidden', clipPath: 'inset(50%)' } : {},
      }} />
    {Boolean(value) && <Typography variant="caption" color="text.secondary">{value} / 5{onChange && ` · ${intl.formatMessage({ id: ratingMessageId })}`}</Typography>}
    {onChange && Boolean(value) && <Button size="small" disabled={disabled} onClick={() => onChange(null)} sx={{ minHeight: 44 }}>{intl.formatMessage({ id: 'shipPhotos.clearRating' })}</Button>}
  </Box>;
}
