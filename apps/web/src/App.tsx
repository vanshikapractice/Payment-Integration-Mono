import { useHealthCheck } from './services/health';

function HealthStatus() {
  const { data, isLoading, isError, error, refetch } = useHealthCheck();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Checking backend health...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-red-800 font-semibold">Backend Unavailable</h3>
            <p className="text-red-600 text-sm mt-1">
              {error instanceof Error ? error.message : 'Failed to connect to backend'}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
          >
            try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">No health data available</p>
      </div>
    );
  }

  const isHealthy = data.status === 'healthy';
  const dbStatus = data.checks.database;

  return (
    <div className={`p-4 rounded-lg border ${
      isHealthy 
        ? 'bg-green-50 border-green-200' 
        : 'bg-yellow-50 border-yellow-200'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Backend Health Check</h3>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          isHealthy ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {data.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Environment</p>
          <p className="font-mono text-gray-900">{data.environment}</p>
        </div>
        <div>
          <p className="text-gray-500">Version</p>
          <p className="font-mono text-gray-900">{data.version}</p>
        </div>
        <div>
          <p className="text-gray-500">Uptime</p>
          <p className="font-mono text-gray-900">{Math.floor(data.uptime)}s</p>
        </div>
        <div>
          <p className="text-gray-500">Database</p>
          <p className={`font-mono ${dbStatus === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
            {dbStatus}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Last checked: {new Date(data.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Payment Application</h1>
          <p className="mt-2 text-gray-600">
            Monorepo starter with React, Vite, Express, and MySQL
          </p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <HealthStatus />
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-gray-900 mb-2">Frontend</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>React 18 + TypeScript</li>
              <li>Vite 5</li>
              <li>Tailwind CSS</li>
              <li>TanStack Query</li>
            </ul>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-gray-900 mb-2">Backend</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>Express + TypeScript</li>
              <li>Prisma ORM</li>
              <li>MySQL Database</li>
              <li>Zod Validation</li>
            </ul>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-gray-900 mb-2">Shared</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>TypeScript Config</li>
              <li>Shared Types Package</li>
              <li>ESLint + Prettier</li>
              <li>pnpm Workspaces</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;