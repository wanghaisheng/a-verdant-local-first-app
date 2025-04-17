# Verdant 多人协作开发规则集合

## 前言

本规则集合旨在为基于 Verdant 框架的项目提供一套标准化的开发指南，解决多人协作过程中可能出现的不一致问题。通过遵循这些规则，团队可以保持代码质量、数据一致性和开发效率。

## 1. 项目结构与代码组织

### 1.1 目录结构规范

```
/project-root
  ├── src/
  │   ├── schema.ts             # 数据模型定义
  │   ├── client.ts             # 自动生成的客户端代码
  │   ├── components/           # React 组件
  │   │   ├── common/           # 通用组件
  │   │   └── features/         # 按功能组织的组件
  │   ├── hooks/                # 自定义 React Hooks
  │   ├── utils/                # 工具函数
  │   ├── migrations/           # 数据迁移文件
  │   └── server/               # 服务器代码（如果有）
  ├── public/                   # 静态资源
  ├── package.json
  └── README.md
```

### 1.2 命名约定

- **文件命名**：使用 kebab-case（如 `task-list.tsx`）
- **组件命名**：使用 PascalCase（如 `TaskList`）
- **函数和变量**：使用 camelCase（如 `createTask`）
- **常量**：使用 UPPER_SNAKE_CASE（如 `MAX_ITEMS`）
- **集合名称**：使用复数形式（如 `tasks` 而非 `task`）
- **字段名称**：使用 camelCase，保持语义清晰（如 `dueDate` 而非 `due`）

## 2. 数据模型设计规则

### 2.1 Schema 定义规范

- **版本控制**：每个 schema 必须指定版本号，便于后续迁移
- **字段定义**：明确指定每个字段的类型和约束
  - 必填字段使用 `required: true`
  - 提供合理的默认值 `default: value`
  - 使用 TypeScript 确保类型安全

```typescript
// 推荐的 schema 定义方式
export default defineSchema({
  version: 1,
  collections: {
    tasks: {
      schema: {
        title: { type: 'string', required: true },
        description: { type: 'string', default: '' },
        status: { type: 'string', default: 'pending' },
        priority: { type: 'number', default: 0 },
        dueDate: { type: 'date' },
        assigneeId: { type: 'string' }
      },
      indexes: [
        ['status'],
        ['priority'],
        ['dueDate'],
        ['assigneeId']
      ]
    }
  }
});
```

### 2.2 关系模型设计

- **使用引用而非嵌套**：避免深层嵌套数据结构，使用 ID 引用关联实体
- **双向关系**：明确定义关系的所有方向，便于查询
- **索引优化**：为常用查询路径创建适当的索引

```typescript
// 推荐的关系模型设计
collections: {
  projects: {
    schema: {
      name: { type: 'string', required: true },
      description: { type: 'string' }
    }
  },
  tasks: {
    schema: {
      title: { type: 'string', required: true },
      projectId: { type: 'string', required: true } // 引用而非嵌套
    },
    indexes: [
      ['projectId'] // 为关系创建索引
    ]
  }
}
```

### 2.3 索引设计原则

- **查询驱动**：根据实际查询模式设计索引，而非预先假设
- **复合索引**：对于多字段过滤和排序，创建复合索引
- **避免过度索引**：只为频繁使用的查询路径创建索引，避免存储和更新开销

```typescript
// 高效的索引设计
indexes: [
  ['status'], // 单字段索引
  ['status', 'priority'], // 复合索引，支持按状态过滤并按优先级排序
  ['assigneeId', 'dueDate'] // 支持查找特定用户的任务并按截止日期排序
]
```

## 3. 状态管理与数据操作规则

### 3.1 数据访问模式

- **使用生成的客户端 API**：始终使用 Verdant 生成的类型安全 API 进行数据操作
- **批量操作**：尽可能合并多个操作，减少更新次数
- **事务一致性**：相关操作应在同一事务中完成，确保数据一致性

```typescript
// 推荐的数据访问模式
const client = useStorage();

// 单个操作
await client.tasks.create({ title: 'New Task', projectId: '123' });

// 批量操作
await client.transact(async () => {
  const projectId = await client.projects.create({ name: 'New Project' });
  await client.tasks.create({ title: 'Task 1', projectId });
  await client.tasks.create({ title: 'Task 2', projectId });
});
```

### 3.2 查询最佳实践

- **精确查询**：使用具体条件而非获取全部后过滤
- **使用索引**：确保查询条件与索引匹配
- **分页处理**：大数据集使用分页查询，避免一次加载过多数据

```typescript
// 高效查询示例

// 不推荐 - 客户端过滤
const allTasks = useQuery(client.tasks.findAll());
const pendingTasks = allTasks.filter(task => task.status === 'pending');

// 推荐 - 服务端过滤
const pendingTasks = useQuery(client.tasks.find({ status: 'pending' }));

// 分页查询
const pagedTasks = useQuery(
  client.tasks.find({ status: 'pending' })
    .sort({ dueDate: 'asc' })
    .skip(page * pageSize)
    .limit(pageSize)
);
```

### 3.3 响应式更新规则

- **使用 Hooks**：优先使用 `useQuery` 和 `useEntity` 获取响应式数据
- **避免本地状态**：尽量减少组件内的本地状态，依赖 Verdant 的响应式系统
- **乐观更新**：在 UI 中立即反映变更，同时进行后台同步

```tsx
// 响应式更新最佳实践
function TaskItem({ id }) {
  // 使用 useEntity 获取响应式数据
  const task = useEntity('tasks', id);
  const client = useStorage();
  
  // 直接更新数据，UI 会自动响应变化
  const toggleComplete = async () => {
    await client.tasks.update(id, {
      completed: !task.completed
    });
    // 无需手动更新本地状态
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

## 4. 同步与冲突解决规则

### 4.1 同步配置标准

- **统一同步端点**：在项目中使用一致的同步端点配置
- **认证标准**：使用统一的认证方法和令牌管理
- **同步模式选择**：根据应用需求选择适当的同步模式（HTTP、WebSocket 或自动）

```typescript
// 标准同步配置
const client = createClient({
  sync: {
    endpoint: '/api/sync',
    websocketEndpoint: process.env.WEBSOCKET_ENDPOINT,
    getAuthToken: async () => authService.getToken(),
    transportMode: 'auto',
    // 定义重试策略
    retryDelayMs: 1000,
    maxRetries: 5
  }
});
```

### 4.2 冲突解决策略

- **默认策略**：明确项目使用的默认冲突解决策略（通常是后写入胜）
- **自定义解决**：对特定数据类型定义自定义冲突解决逻辑
- **用户反馈**：在发生冲突时提供适当的用户界面反馈

```typescript
// 自定义冲突解决示例
const client = createClient({
  conflictResolution: {
    // 对于任务状态的冲突，使用特定的解决策略
    'tasks': {
      resolveConflict: (local, remote, base) => {
        // 如果本地将任务标记为完成，但远程标记为进行中
        // 保留完成状态（完成优先）
        if (local.status === 'completed' && remote.status !== 'completed') {
          return { ...remote, status: 'completed' };
        }
        // 默认使用远程版本
        return remote;
      }
    }
  }
});
```

### 4.3 离线操作处理

- **离线状态检测**：实现可靠的网络状态检测和用户提示
- **队列管理**：合理管理离线操作队列，避免冲突
- **同步状态指示**：为用户提供清晰的同步状态指示器

```tsx
// 离线状态处理示例
function SyncStatusIndicator() {
  const client = useStorage();
  const [syncState, setSyncState] = useState('synchronized');
  
  useEffect(() => {
    const unsubscribe = client.sync.subscribe(state => {
      setSyncState(state.status);
    });
    
    return () => unsubscribe();
  }, [client]);
  
  return (
    <div className="sync-indicator">
      {syncState === 'synchronized' && <CheckIcon color="green" />}
      {syncState === 'synchronizing' && <SyncIcon color="blue" />}
      {syncState === 'error' && <ErrorIcon color="red" />}
      {syncState === 'offline' && <OfflineIcon color="gray" />}
    </div>
  );
}
```

## 5. 多人协作功能规则

### 5.1 在线状态(Presence)标准

- **状态定义**：统一定义在线状态的数据结构
- **更新频率**：设置合理的状态更新间隔，避免过度网络请求
- **状态清理**：定义离线用户状态的清理策略

```typescript
// 标准在线状态配置
const client = createClient({
  sync: {
    // ... 其他同步配置
    presence: {
      // 定义标准的在线状态结构
      initial: {
        status: 'online',
        lastActivity: Date.now(),
        cursor: null,
        selection: null,
        viewingPage: null
      },
      // 状态更新间隔
      debounceMs: 500
    }
  }
});

// 更新在线状态的标准方法
function updateUserPresence(data) {
  client.sync.updatePresence({
    ...client.sync.getPresence(), // 保留现有状态
    ...data, // 更新部分状态
    lastActivity: Date.now() // 始终更新活动时间
  });
}
```

### 5.2 协作编辑规则

- **锁定机制**：实现资源锁定或意图声明，减少编辑冲突
- **变更可见性**：实时显示其他用户的变更
- **合并策略**：定义文本和结构化数据的合并策略

```typescript
// 协作编辑锁定示例
async function editDocument(docId) {
  // 声明编辑意图
  await client.sync.updatePresence({
    editing: docId
  });
  
  // 检查其他用户是否正在编辑
  const otherEditors = [];
  client.sync.presence.subscribe((presenceMap) => {
    otherEditors.length = 0;
    for (const [userId, presence] of Object.entries(presenceMap)) {
      if (userId !== client.sync.userId && presence.editing === docId) {
        otherEditors.push(userId);
      }
    }
    
    // 更新 UI 显示其他编辑者
    updateEditorsUI(otherEditors);
  });
}
```

### 5.3 用户反馈与通知

- **变更通知**：当其他用户修改相关数据时提供通知
- **冲突提示**：在发生编辑冲突时提供清晰的用户界面提示
- **同步状态**：显示数据同步状态和进度

```tsx
// 用户反馈组件示例
function CollaborationNotifications() {
  const client = useStorage();
  const [notifications, setNotifications] = useState([]);
  
  useEffect(() => {
    // 监听数据变更
    const unsubscribe = client.changes.subscribe(change => {
      if (change.userId !== client.sync.userId) {
        // 其他用户的变更
        setNotifications(prev => [
          {
            id: Date.now(),
            message: `${change.userName} 更新了 ${change.collectionName}`,
            timestamp: new Date()
          },
          ...prev
        ]);
      }
    });
    
    return () => unsubscribe();
  }, [client]);
  
  return (
    <div className="notifications-panel">
      {notifications.map(notification => (
        <div key={notification.id} className="notification">
          {notification.message}
          <span className="time">{formatTime(notification.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}
```

## 6. 测试与质量保证规则

### 6.1 单元测试标准

- **模型测试**：测试数据模型的完整性和约束
- **查询测试**：验证查询结果的正确性
- **同步测试**：测试数据同步和冲突解决

```typescript
// 数据模型测试示例
describe('Task Model', () => {
  let client;
  
  beforeEach(async () => {
    client = createTestClient();
    await client.reset();
  });
  
  test('创建任务时必须提供标题', async () => {
    await expect(client.tasks.create({
      // 缺少必填的 title
      status: 'pending'
    })).rejects.toThrow();
  });
  
  test('默认状态应为 pending', async () => {
    const id = await client.tasks.create({
      title: 'Test Task'
    });
    const task = await client.tasks.get(id);
    expect(task.status).toBe('pending');
  });
});
```

### 6.2 集成测试规范

- **同步测试**：测试客户端与服务器的同步功能
- **多客户端测试**：模拟多用户场景，测试协作功能
- **离线恢复测试**：验证网络中断后的恢复能力

```typescript
// 同步测试示例
describe('Data Synchronization', () => {
  let client1, client2, server;
  
  beforeEach(async () => {
    server = createTestServer();
    await server.start();
    
    client1 = createTestClient({
      sync: { endpoint: server.endpoint }
    });
    client2 = createTestClient({
      sync: { endpoint: server.endpoint }
    });
    
    await client1.sync.connect();
    await client2.sync.connect();
  });
  
  afterEach(async () => {
    await server.stop();
  });
  
  test('客户端1的更改应同步到客户端2', async () => {
    // 客户端1创建任务
    const taskId = await client1.tasks.create({
      title: 'Sync Test Task'
    });
    
    // 等待同步完成
    await waitForSync(client1);
    await waitForSync(client2);
    
    // 验证客户端2能看到任务
    const task = await client2.tasks.get(taskId);
    expect(task).toBeDefined();
    expect(task.title).toBe('Sync Test Task');
  });
});
```

### 6.3 性能测试基准

- **数据量测试**：测试大数据量下的性能表现
- **并发操作**：测试多用户并发操作的性能
- **同步延迟**：测量数据同步的延迟和吞吐量

```typescript
// 性能测试示例
describe('Performance Tests', () => {
  test('大数据量查询性能', async () => {
    const client = createTestClient();
    
    // 创建测试数据
    await createBulkTasks(client, 1000);
    
    // 测量查询性能
    const start = performance.now();
    const results = await client.tasks.find({ status: 'pending' }).toArray();
    const duration = performance.now() - start;
    
    expect(results.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100); // 查询应在100ms内完成
  });
});
```

## 7. 版本控制与迁移规则

### 7.1 Schema 版本管理

- **版本号递增**：每次 schema 变更必须递增版本号
- **兼容性保证**：确保向后兼容或提供明确的迁移路径
- **变更文档**：记录每个版本的变更内容

```typescript
// schema 版本管理示例
export default defineSchema({
  // 从版本1升级到版本2
  version: 2,
  collections: {
    tasks: {
      schema: {
        title: { type: 'string', required: true },
        description: { type: 'string' },
        status: { type: 'string', default: 'pending' },
        // 新增字段
        priority: { type: 'number', default: 0 },
        // 重命名的字段 (从 dueDate 变为 deadline)
        deadline: { type: 'date' }
      }
    }
  }
});
```

### 7.2 数据迁移流程

- **迁移脚本**：使用 CLI 生成和管理迁移脚本
- **测试迁移**：在生产环境前测试迁移过程
- **回滚策略**：定义迁移失败时的回滚策略

```typescript
// 迁移脚本示例 (自动生成的文件)
// migrations/1_to_2.ts
export default {
  async up(db) {
    // 获取所有任务
    const tasks = await db.tasks.findAll().toArray();
    
    // 更新每个任务
    for (const task of tasks) {
      // 添加新字段
      if (task.priority === undefined) {
        task.priority = 0;
      }
      
      // 重命名字段
      if (task.dueDate !== undefined) {
        task.deadline = task.dueDate;
        delete task.dueDate;
      }
      
      // 保存更新后的任务
      await db.tasks.update(task.id, task);
    }
  },
  
  async down(db) {
    // 回滚迁移
    const tasks = await db.tasks.findAll().toArray();
    
    for (const task of tasks) {
      // 恢复旧字段名
      if (task.deadline !== undefined) {
        task.dueDate = task.deadline;
        delete task.deadline;
      }
      
      // 删除新字段
      delete task.priority;
      
      await db.tasks.update(task.id, task);
    }
  }
};
```

### 7.3 客户端代码更新

- **代码生成**：schema 变更后重新生成客户端代码
- **类型检查**：使用 TypeScript 确保类型安全
- **废弃标记**：使用注释标记废弃的 API

```typescript
// 重新生成客户端代码
// 命令: npx @verdant-web/cli generate

// 使用新生成的客户端代码
import { createClient } from './client';

const client = createClient();

// 使用新字段
await client.tasks.create({
  title: 'New Task',
  priority: 2,
  deadline: new Date('2023-12-31')
});

// 标记废弃的 API
/**
 * @deprecated 使用 client.tasks.findByDeadline 代替
 */
function findByDueDate(date) {
  console.warn('findByDueDate 已废弃，请使用 findByDeadline');
  return client.tasks.find({ deadline: date });
}
```

## 8. 部署与环境配置规则

### 8.1 环境配置标准

- **配置分离**：将环境特定配置与代码分离
- **密钥管理**：安全存储和访问敏感信息
- **环境变量**：使用环境变量注入配置

```typescript
// 环境配置示例
const config = {
  development: {
    syncEndpoint: 'http://localhost:3000/api/sync',
    websocketEndpoint: 'ws://localhost:3000/ws',
    debug: true
  },
  production: {
    syncEndpoint: 'https://api.example.com/sync',
    websocketEndpoint: 'wss://api.example.com/ws',
    debug: false
  }
};

// 根据环境创建客户端
const env = process.env.NODE_ENV || 'development';
const client = createClient({
  namespace: 'my-app',
  debug: config[env].debug,
  sync: {
    endpoint: config[env].syncEndpoint,
    websocketEndpoint: config[env].websocketEndpoint,
    getAuthToken: async () => authService.getToken()
  }
});
```

### 8.2 服务器部署规范

- **可扩展性**：设计支持水平扩展的服务器架构
- **数据备份**：定期备份服务器数据
- **监控**：实现服务器健康和性能监控

```typescript
// 服务器配置示例
import { Server } from '@verdant-web/server';
import { sqlStorage } from '@verdant-web/server/sql';

const server = new Server({
  // 从环境变量获取密钥
  tokenSecret: process.env.TOKEN_SECRET,
  // 数据存储配置
  storage: sqlStorage({
    // 生产环境使用数据库连接字符串
    connectionString: process.env.DATABASE_URL,
    // 开发环境使用本地文件
    filename: process.env.NODE_ENV === 'development' ? './dev.sqlite' : undefined
  }),
  // 文件存储配置
  fileStorage: process.env.S3_BUCKET ? s3FileStorage({
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION
  }) : localFileStorage({
    directory: './files'
  }),
  // 日志配置
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});
```

### 8.3 客户端部署检查清单

- **构建优化**：优化客户端代码和资源
- **缓存策略**：实现适当的缓存策略
- **版本兼容性**：确保客户端与服务器版本兼容

```typescript
// 客户端版本检查示例
const client = createClient({
  sync: {
    endpoint: '/api/sync',
    // 连接时检查版本兼容性
    onConnect: async (serverInfo) => {
      if (serverInfo.minClientVersion && 
          semver.lt(CLIENT_VERSION, serverInfo.minClientVersion)) {
        // 版本不兼容，提示用户更新
        showUpdateRequiredNotification();
        return false; // 阻止连接
      }
      return true; // 允许连接
    }
  }
});
```

## 9. 文档与注释规范

### 9.1 代码注释标准

- **文件头注释**：包含文件描述、作者和版本信息
- **函数注释**：描述函数功能、参数和返回值
- **复杂逻辑注释**：解释复杂算法和业务逻辑

```typescript
/**
 * @file TaskService.ts
 * @description 任务管理服务，处理任务的创建、更新和查询
 * @version 1.0.0
 */

/**
 * 创建新任务并分配给用户
 * @param {string} title - 任务标题
 * @param {string} description - 任务描述
 * @param {string} assigneeId - 被分配用户的ID
 * @returns {Promise<string>} 新创建任务的ID
 */
async function createAndAssignTask(title, description, assigneeId) {
  // 验证参数
  if (!title || !assigneeId) {
    throw new Error('标题和分配用户ID不能为空');
  }
  
  // 创建任务并返回ID
  return client.tasks.create({
    title,
    description,
    assigneeId,
    status: 'assigned',
    createdAt: new Date()
  });
}
```

### 9.2 API 文档规范

- **集合文档**：记录每个集合的用途和字段
- **查询文档**：记录常用查询模式和示例
- **示例代码**：提供常见操作的代码示例

```markdown
# 任务集合 API 文档

## 集合描述

`tasks` 集合用于存储和管理项目任务。每个任务包含标题、描述、状态、优先级等信息。

## 字段定义

| 字段名 | 类型 | 必填 | 默认值 | 描述 |
|-------|------|------|-------|------|
| title | string | 是 | - | 任务标题 |
| description | string | 否 | "" | 任务详细描述 |
| status | string | 否 | "pending" | 任务状态，可选值：pending, in_progress, completed |
| priority | number | 否 | 0 | 任务优先级，数值越大优先级越高 |
| dueDate | date | 否 | - | 任务截止日期 |
| assigneeId | string | 否 | - | 任务负责人ID |

## 常用查询

### 获取所有任务

```typescript
const allTasks = await client.tasks.findAll().toArray();
```

### 按状态查询任务

```typescript
const pendingTasks = await client.tasks.find({ status: 'pending' }).toArray();
```

### 查询特定用户的任务

```typescript
const userTasks = await client.tasks.find({ assigneeId: userId }).toArray();
```

### 按截止日期排序

```typescript
const sortedTasks = await client.tasks
  .findAll()
  .sort({ dueDate: 'asc' })
  .toArray();
```
```

### 9.3 用户指南与培训文档

- **入门指南**：为新团队成员提供快速入门文档
- **最佳实践**：记录项目特定的最佳实践和模式
- **常见问题**：维护常见问题解答文档

```markdown
# Verdant 项目入门指南

## 环境设置

1. 克隆项目仓库
   ```bash
   git clone https://github.com/your-org/your-project.git
   cd your-project
   ```

2. 安装依赖
   ```bash
   npm install
   ```

3. 启动开发服务器
   ```bash
   npm run dev
   ```

## 常见开发任务

### 添加新集合

1. 在 `schema.ts` 中定义新集合
2. 运行 `npx @verdant-web/cli generate` 生成客户端代码
3. 在组件中使用新集合

### 创建新组件

遵循项目的组件结构和命名约定...
```

## 10. 协作工作流规则

### 10.1 Git 工作流规范

- **分支策略**：使用 feature/bugfix/release 分支命名约定
- **提交消息**：遵循结构化提交消息格式
- **代码审查**：所有合并请求必须经过代码审查

```bash
# 分支命名约定
feature/add-task-filtering
bugfix/fix-sync-conflict
release/v1.2.0

# 提交消息格式
feat: 添加任务过滤功能
fix: 修复同步冲突问题
chore: 更新依赖版本
docs: 更新API文档
```

### 10.2 问题跟踪与任务管理

- **问题模板**：使用标准化的问题描述模板
- **标签系统**：使用一致的标签分类问题
- **里程碑**：按功能和发布计划组织里程碑

### 10.3 代码审查清单

- **功能完整性**：确保实现满足需求
- **代码质量**：检查代码风格、性能和可维护性
- **数据模型**：验证数据模型设计和索引
- **同步逻辑**：检查同步和冲突解决逻辑
- **测试覆盖**：确保适当的测试覆盖率

## 11. 总结

本规则集合为基于 Verdant 框架的多人协作项目提供了全面的指导，涵盖了从项目结构、数据模型设计到同步策略、测试规范等各个方面。通过遵循这些规则，团队可以：

1. **保持代码一致性**：统一的命名约定、目录结构和编码风格
2. **优化数据模型**：合理的 schema 设计和索引策略
3. **提高协作效率**：清晰的同步配置和冲突解决策略
4. **确保数据质量**：全面的测试和验证机制
5. **简化维护工作**：标准化的文档和注释

随着项目的发展，团队应定期审查和更新这些规则，确保它们继续满足项目需求并反映最佳实践。通过建立这套规则，团队可以充分利用 Verdant 框架的优势，构建高质量、可靠的本地优先应用。