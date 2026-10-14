import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { Login } from '@/features/auth/Login'
import { homeFor, RequireRole, Splash } from '@/features/auth/RequireRole'
import type { Role } from '@/lib/schemas'
import { AppShell } from '@/components/layout/AppShell'
import { RootLayout } from '@/app/App'

const page = <M, K extends keyof M>(load: () => Promise<M>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })))

const MyTripsPage = page(() => import('@/features/driver/trips/MyTripsPage'), 'MyTripsPage')
const ActiveTripPage = page(() => import('@/features/driver/active-trip/ActiveTripPage'), 'ActiveTripPage')
const TripDonePage = page(() => import('@/features/driver/active-trip/TripDonePage'), 'TripDonePage')
const AccountPage = page(() => import('@/features/account/AccountPage'), 'AccountPage')

const TripsListPage = page(() => import('@/features/admin/trips/TripsListPage'), 'TripsListPage')
const TripDetailPage = page(() => import('@/features/admin/trips/TripDetailPage'), 'TripDetailPage')
const AssignTripPage = page(() => import('@/features/admin/trips/AssignTripPage'), 'AssignTripPage')
const RoutesPage = page(() => import('@/features/admin/routes/RoutesPage'), 'RoutesPage')
const RouteBuilder = page(() => import('@/features/admin/routes/RouteBuilder'), 'RouteBuilder')
const ShopsPage = page(() => import('@/features/admin/shops/ShopsPage'), 'ShopsPage')
const UsersPage = page(() => import('@/features/admin/users/UsersPage'), 'UsersPage')
const DriverHistoryPage = page(() => import('@/features/admin/users/DriverHistoryPage'), 'DriverHistoryPage')
const ConfigPage = page(() => import('@/features/admin/config/ConfigPage'), 'ConfigPage')

const shell = (area: 'admin' | 'driver', roles: Role[]) => (
  <RequireRole roles={roles}>
    <Suspense fallback={<Splash />}>
      <AppShell area={area} />
    </Suspense>
  </RequireRole>
)

export const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <RootLayout />
      </AuthProvider>
    ),
    children: [
      { path: '/login', element: <Login /> },

      {
        path: '/driver',
        element: shell('driver', ['driver']),
        children: [
          { index: true, element: <MyTripsPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'trips/:id', element: <ActiveTripPage /> },
          { path: 'trips/:id/done', element: <TripDonePage /> },
        ],
      },

      {
        path: '/admin',
        element: shell('admin', ['admin', 'superadmin']),
        children: [
          { index: true, element: <Navigate to="/admin/trips" replace /> },
          { path: 'trips', element: <TripsListPage /> },
          { path: 'trips/new', element: <AssignTripPage /> },
          { path: 'trips/:id', element: <TripDetailPage /> },
          { path: 'routes', element: <RoutesPage /> },
          { path: 'routes/new', element: <RouteBuilder /> },
          { path: 'routes/:id', element: <RouteBuilder /> },
          { path: 'shops', element: <ShopsPage /> },
          { path: 'drivers', element: <UsersPage /> },
          { path: 'drivers/:uid/history', element: <DriverHistoryPage /> },
          { path: 'settings', element: <ConfigPage /> },
        ],
      },

      { path: '/', element: <RoleHome /> },
      { path: '*', element: <RoleHome /> },
    ],
  },
])

function RoleHome() {
  const { user, role, loading } = useAuth()
  if (loading) return <Splash />
  return <Navigate to={user && role ? homeFor(role) : '/login'} replace />
}
