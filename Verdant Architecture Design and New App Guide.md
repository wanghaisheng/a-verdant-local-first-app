# Verdant Architecture Design and New App Guide

## 1. Verdant Architecture Overview

Verdant is a persistence, sync, and collaboration framework designed for sustainable, human, local-first web applications. Its core philosophy is to store data on the user's device while providing optional server synchronization for cross-device data syncing and multi-user collaboration.

### 1.1 Core Component Architecture

```
+-------------------+      +-------------------+      +-------------------+
|                   |      |                   |      |                   |
|  @verdant-web/    |      |  @verdant-web/    |      |  @verdant-web/    |
|     store         |<---->|     server        |<---->|     store         |
| (Client Storage)  |      | (Server Sync)     |      | (Client Storage)  |
|                   |      |                   |      |                   |
+-------------------+      +-------------------+      +-------------------+
         ^                                                     ^
         |                                                     |
         v                                                     v
+-------------------+                                +-------------------+
|                   |                                |                   |
|  @verdant-web/    |                                |  @verdant-web/    |
|     react         |                                |     react         |
| (React Bindings)  |                                | (React Bindings)  |
|                   |                                |                   |
+-------------------+                                +-------------------+
```

### 1.2 Package Structure and Responsibilities

- **@verdant-web/store**: Client core library for local data storage, querying, and operations
  - Uses IndexedDB as the underlying storage
  - Provides reactive query API
  - Manages documents and entities
  - Handles local data changes and conflict resolution

- **@verdant-web/server**: Server component for data synchronization and multi-device collaboration
  - Provides data sync API
  - Manages user connections and state
  - Handles file storage
  - Supports real-time collaboration and state synchronization

- **@verdant-web/react**: React framework integration
  - Provides React Hooks for data access
  - Automatically handles component and data state synchronization

- **@verdant-web/cli**: Command-line tool
  - Generates type-safe client code
  - Creates and manages data migration files

- **Additional Support Packages**:
  - @verdant-web/common: Shared code between client and server
  - @verdant-web/create-app: Project scaffolding tool
  - @verdant-web/react-router: Router components integrated with React Router

## 2. Data Model and Working Principles

### 2.1 Data Storage Model

Verdant uses the concepts of baselines and operations to store data:

- **Baseline**: The starting point for an object that all replicas agree on
- **Operation**: An atomic change to an object, each with a unique timestamp
- **Snapshot**: The current state obtained by applying all operations to the baseline in order

### 2.2 Synchronization and Conflict Resolution

Verdant uses object identity (ID) rather than position to track changes, making conflict resolution more reliable:

1. Each object has a unique ID, and operations are bound to specific objects rather than positions
2. Operations are applied in timestamp order, using a last-write-wins strategy
3. The server maintains a global order of operations, ensuring all clients eventually reach consistency

### 2.3 Query Mechanism

The client computes and caches document snapshots, with queries executed against these snapshots:

1. Query results are cached, with identical queries sharing datasets
2. All entities are cached by ID, ensuring changes synchronously propagate to all places using that entity
3. Queries are reactive, automatically updating when underlying data changes

## 3. New Application Startup Guide

### 3.1 Setting Up a Local Storage Application

#### Step 1: Install Required Packages

```bash
# Using npm
npm install @verdant-web/store @verdant-web/cli

# Or using yarn
yarn add @verdant-web/store @verdant-web/cli

# Or using pnpm
pnpm add @verdant-web/store @verdant-web/cli
```

#### Step 2: Define Data Model

Create a `schema.ts` file:

```typescript
import { defineSchema } from '@verdant-web/store';

export default defineSchema({
  version: 1,
  collections: {
    tasks: {
      schema: {
        title: { type: 'string', required: true },
        completed: { type: 'boolean', default: false },
        dueDate: { type: 'date' },
        notes: { type: 'string' }
      },
      indexes: [
        ['completed'],
        ['dueDate']
      ]
    },
    categories: {
      schema: {
        name: { type: 'string', required: true },
        color: { type: 'string' }
      }
    }
  }
});
```

#### Step 3: Generate Client Code

```bash
npx @verdant-web/cli generate
```

This will generate type-safe client code, including:
- `client.ts`: Client instance and collection access methods
- `client.d.ts`: TypeScript type definitions

#### Step 4: Initialize Client

```typescript
import { createClient } from './client';

const client = createClient({
  // Optional configuration
  namespace: 'my-app',
  debug: process.env.NODE_ENV !== 'production'
});

// Now you can use the client to operate on data
```

### 3.2 Using React Integration

#### Step 1: Install React Bindings

```bash
npm install @verdant-web/react
```

#### Step 2: Set Up Provider

```tsx
import { StorageProvider } from '@verdant-web/react';
import { createClient } from './client';
import App from './App';

const client = createClient();

function Root() {
  return (
    <StorageProvider client={client}>
      <App />
    </StorageProvider>
  );
}
```

#### Step 3: Use Data in Components

```tsx
import { useStorage, useQuery, useEntity } from './client';

function TaskList() {
  const client = useStorage();
  const tasks = useQuery(client.tasks.findAll());
  
  const createTask = async () => {
    await client.tasks.create({
      title: 'New Task',
      completed: false
    });
  };
  
  return (
    <div>
      <button onClick={createTask}>Add Task</button>
      <ul>
        {tasks.map(task => (
          <TaskItem key={task.id} id={task.id} />
        ))}
      </ul>
    </div>
  );
}

function TaskItem({ id }) {
  const task = useEntity('tasks', id);
  const client = useStorage();
  
  const toggleComplete = async () => {
    await client.tasks.update(id, {
      completed: !task.completed
    });
  };
  
  return (
    <li>
      <input 
        type="checkbox" 
        checked={task.completed} 
        onChange={toggleComplete} 
      />
      {task.title}
    </li>
  );
}
```

### 3.3 Adding Server Synchronization

#### Step 1: Set Up Server

```typescript
// server.js
import { Server } from '@verdant-web/server';
import { sqlStorage } from '@verdant-web/server/sql';

const server = new Server({
  tokenSecret: process.env.TOKEN_SECRET,
  storage: sqlStorage({
    filename: './data.sqlite'
  })
});

// Set up HTTP routes to handle sync requests
app.post('/api/sync', async (req, res) => {
  const result = await server.handleSyncRequest(req.body, {
    userId: req.user.id,
    libraryId: req.params.libraryId
  });
  res.json(result);
});

// Optional: Set up WebSocket support
server.handleUpgrade(httpServer);

server.listen(3000);
```

#### Step 2: Configure Client Synchronization

```typescript
const client = createClient({
  sync: {
    // HTTP sync endpoint
    endpoint: '/api/sync',
    // Optional: WebSocket support
    websocketEndpoint: 'ws://localhost:3000/ws',
    // Authentication function
    getAuthToken: async () => {
      return localStorage.getItem('auth_token');
    },
    // Sync mode
    transportMode: 'auto' // 'http', 'websocket', or 'auto'
  }
});
```

### 3.4 Implementing Multi-User Collaboration

#### Step 1: Set Up Presence

```typescript
// Client
const client = createClient({
  sync: {
    // ... other sync configuration
    presence: {
      // Initial state
      initial: {
        cursor: { x: 0, y: 0 },
        selection: null
      },
      // State update interval
      debounceMs: 100
    }
  }
});

// Update presence
client.sync.updatePresence({
  cursor: { x: mouseX, y: mouseY },
  selection: selectedText
});

// Listen for other users' presence
client.sync.presence.subscribe((presenceMap) => {
  // Handle other users' presence
  console.log('Online users:', Object.keys(presenceMap).length);
  
  // Each user's state
  for (const [userId, presence] of Object.entries(presenceMap)) {
    console.log(`User ${userId}'s cursor position:`, presence.cursor);
  }
});
```

## 4. Best Practices and Considerations

### 4.1 Data Model Design

- Use appropriate indexes to optimize query performance
- Consider data relationships and reference design
- Avoid deeply nested structures, use references instead

### 4.2 Data Migration

When your data model changes, use the CLI to generate migration files:

```bash
npx @verdant-web/cli migrate
```

### 4.3 Performance Optimization

- Use precise queries rather than fetching all data and filtering
- Leverage indexes to speed up queries
- Consider paginated queries for large collections

### 4.4 Offline Support

- Verdant supports offline operations by default
- Test application behavior in offline state
- Implement appropriate conflict resolution strategies

## 5. Conclusion

Verdant provides a complete framework for local-first application development, with comprehensive support from local storage to device synchronization to multi-user collaboration. By following this guide, you can quickly build a web application with modern features while maintaining local-first characteristics for better user experience and privacy protection.

Developers can progressively add features as needed, starting with a simple local application and gradually expanding to support device synchronization and multi-user collaboration. Verdant's modular design makes this progressive development simple and natural.