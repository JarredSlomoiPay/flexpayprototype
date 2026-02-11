import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import type { ReactElement } from 'react';
import { GetPaidPage } from './pages/GetPaidPage';
import { NewPaymentPage } from './pages/NewPaymentPage';
import { AuthPage } from './pages/AuthPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SelectTypePage } from './pages/SelectTypePage';
import { SupplierSinglePage } from './pages/SupplierSinglePage';

function AuthLoadingScreen() {
  return (
    <main className="flexpay-auth-shell">
      <section className="flexpay-auth-card">
        <h1>Loading</h1>
        <p className="flexpay-auth-subtitle">Checking your session...</p>
      </section>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  return (
    <div className="flexpay-prototype-shell">
      <div className="flexpay-prototype-banner" data-testid="prototype-banner">
        Flex Pay Prototype
      </div>
      <div className="flexpay-prototype-content">{children}</div>
    </div>
  );
}

function PublicOnly({ children }: { children: ReactElement }) {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return <AuthLoadingScreen />;
  }
  if (isAuthenticated) {
    return <Navigate to="/new-payment" replace />;
  }
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/new-payment" replace />} />
      <Route path="/auth" element={<PublicOnly><AuthPage /></PublicOnly>} />
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      <Route
        path="/new-payment"
        element={(
          <RequireAuth>
            <NewPaymentPage />
          </RequireAuth>
        )}
      />
      <Route
        path="/select-type"
        element={(
          <RequireAuth>
            <SelectTypePage />
          </RequireAuth>
        )}
      />
      <Route
        path="/supplier-single"
        element={(
          <RequireAuth>
            <SupplierSinglePage />
          </RequireAuth>
        )}
      />
      <Route
        path="/get-paid"
        element={(
          <RequireAuth>
            <GetPaidPage />
          </RequireAuth>
        )}
      />
      <Route path="*" element={<Navigate to="/new-payment" replace />} />
    </Routes>
  );
}
