import { Button } from '@mui/material';
import { Icon } from '../Icons';
import { useProjectStore } from '../../stores/projectStore';

export function CollageExportButton() {
  const count = useProjectStore((state) => state.collageDraft.photoIds.length);
  return <Button fullWidth variant="contained" disabled={count < 2} startIcon={<Icon name="export" size={16} />} onClick={() => window.dispatchEvent(new CustomEvent('still:request-collage-export'))}>Export collage</Button>;
}
