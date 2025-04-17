# Verdant 架构设计和新应用启动指南

## 1. Verdant 架构概述

Verdant 是一个为本地优先(local-first)应用设计的持久化、同步和协作框架，专注于可持续、人性化的 Web 应用开发。其核心理念是将数据存储在用户设备上，同时提供可选的服务器同步功能，实现设备间数据同步和多人协作。

### 1.1 核心组件架构

```
+-------------------+      +-------------------+      +-------------------+
|                   |      |                   |      |                   |
|  @verdant-web/    |      |  @verdant-web/    |      |  @verdant-web/    |
|     store         |<---->|     server        |<---->|     store         |
| (客户端存储)       |      | (服务器同步)       |      | (客户端存储)       |
|                   |      |                   |      |                   |
+-------------------+      +-------------------+      +-------------------+
         ^                                                     ^
         |                                                     |
         v                                                     v
+-------------------+                                +-------------------+
|                   |                                |                   |
|  @verdant-web/    |                                |  @verdant-web/    |
|     react         |                                |     react         |
| (React 绑定)      |                                | (React 绑定)      |
|                   |                                |                   |
+-------------------+                                +-------------------+
```

### 1.2 包结构和职责

- **@verdant-web/store**: 客户端核心库，负责本地数据存储、查询和操作
  - 使用 IndexedDB 作为底层存储
  - 提供响应式查询 API
  - 管理文档和实体
  - 处理本地数据变更和冲突解决

- **@verdant-web/server**: 服务器组件，负责数据同步和多设备协作
  - 提供数据同步 API
  - 管理用户连接和状态
  - 处理文件存储
  - 支持实时协作和状态同步

- **@verdant-web/react**: React 框架集成
  - 提供 React Hooks 用于数据访问
  - 自动处理组件与数据状态同步

- **@verdant-web/cli**: 命令行工具
  - 生成类型安全的客户端代码
  - 创建和管理数据迁移文件

- **其他辅助包**:
  - @verdant-web/common: 客户端和服务器共享的通用代码
  - @verdant-web/create-app: 项目脚手架工具
  - @verdant-web/react-router: 与 React Router 集成的路由组件

## 2. 数据模型和工作原理

### 2.1 数据存储模型

Verdant 使用基线(baseline)和操作(operation)的概念来存储数据：

- **基线(Baseline)**: 所有副本一致同意的对象起始状态
- **操作(Operation)**: 对对象的原子性更改，每个操作都有唯一的时间戳
- **快照(Snapshot)**: 通过将所有操作按顺序应用到基线上得到的当前状态

### 2.2 同步和冲突解决

Verdant 使用对象身份(ID)而非位置来跟踪变更，这使得冲突解决更加可靠：

1. 每个对象都有唯一ID，操作绑定到特定对象而非位置
2. 操作按时间戳顺序应用，采用后写入胜(last-write-wins)策略
3. 服务器维护操作的全局顺序，确保所有客户端最终一致

### 2.3 查询机制

客户端计算并缓存文档快照，查询针对这些快照执行：

1. 查询结果会被缓存，相同查询共享数据集
2. 所有实体按ID缓存，确保变更同步传播到所有使用该实体的地方
3. 查询是响应式的，当底层数据变化时自动更新

## 3. 新应用启动指南

### 3.1 设置本地存储应用

#### 步骤 1: 安装必要的包

```bash
# 使用 npm
npm install @verdant-web/store @verdant-web/cli

# 或使用 yarn
yarn add @verdant-web/store @verdant-web/cli

# 或使用 pnpm
pnpm add @verdant-web/store @verdant-web/cli
```

#### 步骤 2: 定义数据模型

创建 `schema.ts` 文件：

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

#### 步骤 3: 生成客户端代码

```bash
npx @verdant-web/cli generate
```

这将生成类型安全的客户端代码，包括：
- `client.ts`: 客户端实例和集合访问方法
- `client.d.ts`: TypeScript 类型定义

#### 步骤 4: 初始化客户端

```typescript
import { createClient } from './client';

const client = createClient({
  // 可选配置
  namespace: 'my-app',
  debug: process.env.NODE_ENV !== 'production'
});

// 现在可以使用客户端操作数据
```

### 3.2 使用 React 集成

#### 步骤 1: 安装 React 绑定

```bash
npm install @verdant-web/react
```

#### 步骤 2: 设置 Provider

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

#### 步骤 3: 在组件中使用数据

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

### 3.3 添加服务器同步功能

#### 步骤 1: 设置服务器

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

// 设置 HTTP 路由处理同步请求
app.post('/api/sync', async (req, res) => {
  const result = await server.handleSyncRequest(req.body, {
    userId: req.user.id,
    libraryId: req.params.libraryId
  });
  res.json(result);
});

// 可选：设置 WebSocket 支持
server.handleUpgrade(httpServer);

server.listen(3000);
```

#### 步骤 2: 配置客户端同步

```typescript
const client = createClient({
  sync: {
    // HTTP 同步端点
    endpoint: '/api/sync',
    // 可选：WebSocket 支持
    websocketEndpoint: 'ws://localhost:3000/ws',
    // 身份验证函数
    getAuthToken: async () => {
      return localStorage.getItem('auth_token');
    },
    // 同步模式
    transportMode: 'auto' // 'http', 'websocket', 或 'auto'
  }
});
```

### 3.4 实现多人协作功能

#### 步骤 1: 设置在线状态(Presence)

```typescript
// 客户端
const client = createClient({
  sync: {
    // ... 其他同步配置
    presence: {
      // 初始状态
      initial: {
        cursor: { x: 0, y: 0 },
        selection: null
      },
      // 状态更新间隔
      debounceMs: 100
    }
  }
});

// 更新在线状态
client.sync.updatePresence({
  cursor: { x: mouseX, y: mouseY },
  selection: selectedText
});

// 监听其他用户的在线状态
client.sync.presence.subscribe((presenceMap) => {
  // 处理其他用户的在线状态
  console.log('在线用户:', Object.keys(presenceMap).length);
  
  // 每个用户的状态
  for (const [userId, presence] of Object.entries(presenceMap)) {
    console.log(`用户 ${userId} 的光标位置:`, presence.cursor);
  }
});
```

## 4. 最佳实践和注意事项

### 4.1 数据模型设计

- 使用合适的索引优化查询性能
- 考虑数据关系和引用设计
- 避免过深的嵌套结构，使用引用代替

### 4.2 数据迁移

当你的数据模型发生变化时，使用 CLI 生成迁移文件：

```bash
npx @verdant-web/cli migrate
```

### 4.3 性能优化

- 使用精确的查询而非获取全部数据后过滤
- 利用索引加速查询
- 考虑大型集合的分页查询

### 4.4 离线支持

- Verdant 默认支持离线操作
- 测试应用在离线状态下的行为
- 实现适当的冲突解决策略

## 5. 总结

Verdant 提供了一个完整的本地优先应用开发框架，从本地存储到设备同步再到多人协作，都有完善的支持。通过遵循本指南，你可以快速搭建一个具有现代特性的 Web 应用，同时保持数据的本地优先特性，提供更好的用户体验和隐私保护。

开发者可以根据需求逐步添加功能，从简单的本地应用开始，逐步扩展到支持设备同步和多人协作的复杂应用。Verdant 的模块化设计使这种渐进式开发变得简单而自然。