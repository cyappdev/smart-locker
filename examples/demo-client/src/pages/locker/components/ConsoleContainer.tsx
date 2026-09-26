import { Box, Paper } from '@mui/material';
import lockerImage from '../../../assets/locker.png';

export const ConsoleContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Paper
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#EFE7C0',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 4 } }}>{children}</Box>
      <Box
        component="img"
        src={lockerImage}
        alt=""
        sx={{
          width: '40%',
          alignSelf: 'flex-end',
          display: 'block',
          opacity: 0.4,
        }}
      />
    </Paper>
  );
};
