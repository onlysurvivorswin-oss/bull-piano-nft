# Bull & Piano - Dynamic NFT Viewer

## Overview

Bull & Piano is a dynamic NFT application that changes visual states based on market sentiment. The system displays different images ("capitulation", "stagnation", "resilience", "euphoria") depending on real-time market data analysis. Built as a full-stack web application with a React frontend and Express backend, it features a market sentiment analysis API that processes NFT collection statistics to determine the appropriate visual state.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Component Structure**: Modular component library with reusable UI components

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints with JSON responses
- **Middleware**: CORS handling, request logging, and error handling
- **Market Analysis**: Custom sentiment calculation engine that processes NFT collection data
- **Caching Strategy**: In-memory caching with 12-hour TTL for API responses

### Database & ORM
- **Database**: PostgreSQL configured via Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Neon Database serverless connection via environment variables
- **Type Safety**: Full TypeScript integration with Drizzle for compile-time query validation

### Development & Build System
- **Build Tool**: Vite for frontend bundling with React plugin
- **Backend Build**: ESBuild for server-side bundling
- **Development**: Hot module replacement and development server integration
- **TypeScript**: Strict type checking with path mapping for clean imports

### Asset Management
- **Static Assets**: Arweave-hosted images for each market sentiment state
- **Image Delivery**: Direct URL references to decentralized storage
- **Cache Busting**: Query parameter-based cache invalidation for dynamic updates

### Market Sentiment Engine
- **Data Processing**: Analyzes NFT collection volume ratios (24h vs 30-day average)
- **State Mapping**: Algorithm-based classification into four sentiment categories
- **Threshold Logic**: Configurable ratio thresholds for state transitions
- **Fallback Handling**: Default to "stagnation" state when data is unavailable

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: React 18, React DOM, React Hook Form with Zod validation
- **UI Components**: Radix UI primitives for accessible component foundation
- **Styling**: Tailwind CSS with PostCSS for processing

### Backend Services
- **Database**: Neon Database (PostgreSQL-compatible serverless database)
- **ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations

### Build & Development Tools
- **Vite**: Frontend build tool with React plugin and development server
- **TypeScript**: Language and type system for both frontend and backend
- **ESBuild**: Fast bundler for production server builds

### Utility Libraries
- **Data Fetching**: TanStack Query for server state management and caching
- **Form Handling**: React Hook Form with Hookform Resolvers for Zod integration
- **Date Handling**: date-fns for date manipulation and formatting
- **Styling Utilities**: clsx and class-variance-authority for conditional styling

### Asset Storage
- **Arweave**: Decentralized storage network for hosting NFT state images
- **Image URLs**: Direct HTTPS access to permanent, immutable asset storage