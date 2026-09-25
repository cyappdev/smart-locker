import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router";
import { AppBar, Button, ButtonGroup, Container, CssBaseline, Stack, Toolbar, Typography } from "@mui/material";
import { AdminPage } from "./pages/admin";
import { ErrorPage404 } from "./pages/error/404";
import { LockerPage } from "./pages/locker";
import { StressTestPage } from "./pages/stress";

function AppNavigation() {
  const { pathname } = useLocation();

  return (

    <AppBar position="sticky" color="default">
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          <Stack direction="row" spacing={3}>
            <Typography variant="h6" component="div">
              Smart Locker
            </Typography>
            <ButtonGroup
              disableElevation
            >
              {[
                { to: "/admin", label: "Locker Management" },
                { to: "/locker", label: "Locker Console" },
                { to: "/stress", label: "Concurrency Test" },
              ].map(({ to, label }) => (
                <Button
                  size="small"
                  key={to}
                  component={Link}
                  to={to}
                  variant={pathname === to ? "contained" : "outlined"}
                >
                  {label}
                </Button>
              ))}
            </ButtonGroup>
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>

  );
}

export function App() {
  return (
    <BrowserRouter>
      <CssBaseline />
      <Stack sx={{ height: "100dvh" }}>
        <AppNavigation />
        <Container component="main" maxWidth="lg" sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <Routes>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/locker" element={<LockerPage />} />
            <Route path="/stress" element={<StressTestPage />} />
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<ErrorPage404 />} />
          </Routes>
        </Container>
      </Stack>
    </BrowserRouter>
  );
}
