# Architectural Decisions & Principles — Eventora

## 1. Architectural Philosophy

### 1.1 Vertical Slice Architecture vs Horizontal Layers
Traditional layered architectures (controller -> service -> repository -> model) spread a single feature across distant directories, creating high coupling between unrelated business features.

Eventora uses **Vertical Slice Architecture**:
- Each business domain (`authentication`, `events`, `registrations`, `cancellations`) encapsulates its own controllers, services, schemas, and routes.
- Shared infrastructure (`database`, `session`, `logging`, `security`) and cross-cutting concerns (`middleware`, `errors`) are centralized under `shared/` and `infrastructure/`.
- Adding or modifying a feature touches only that vertical slice, preventing regression across unrelated workflows.

### 1.2 Modular Monolith over Microservices
For an event booking platform at this scale:
- Microservices introduce distributed transaction overhead, network latency, serialization costs, and infrastructure complexity (e.g., Kafka, Kubernetes).
- A **Modular Monolith** provides strict logical boundaries and domain isolation while running within a single optimized process with low latency, single-database ACID capabilities, and simplified deployment.

### 1.3 Stateless Backend with Shared Distributed State
Apart from the external MongoDB instance and session collection, the Express backend maintains zero in-memory application state:
- No in-memory user sessions (stored in MongoDB `sessions`).
- No in-memory rate limiting (stored in MongoDB `rate_limits`).
- Allows seamless horizontal scaling across multi-instance server deployments (Render, AWS, ECS) without sticky sessions.
