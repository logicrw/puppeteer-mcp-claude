#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
class PuppeteerMCPServer {
    server;
    browser = null;
    pages = new Map();
    logFile;
    currentViewport = null;
    constructor() {
        // Set up logging
        const logDir = path.join(os.homedir(), '.puppeteer-mcp-logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        this.logFile = path.join(logDir, `mcp-server-${Date.now()}.log`);
        this.log('=== Puppeteer MCP Server Starting ===');
        this.log(`Process started at: ${new Date().toISOString()}`);
        this.log(`Process ID: ${process.pid}`);
        this.log(`Node version: ${process.version}`);
        this.log(`Working directory: ${process.cwd()}`);
        this.log(`Script location: ${__filename}`);
        this.log(`Arguments: ${JSON.stringify(process.argv)}`);
        this.log(`Environment PATH: ${process.env.PATH}`);
        this.log(`Log file: ${this.logFile}`);
        this.server = new index_js_1.Server({
            name: 'mcp-puppeteer',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFile, logMessage);
        console.error(logMessage.trim()); // Also log to stderr
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            this.log(`[MCP Error] ${error}`);
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', async () => {
            this.log('Received SIGINT, cleaning up...');
            await this.cleanup();
            process.exit(0);
        });
        process.on('uncaughtException', (error) => {
            this.log(`Uncaught Exception: ${error.stack}`);
            console.error('Uncaught Exception:', error);
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });
    }
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
    setupToolHandlers() {
        this.log('Setting up tool handlers...');
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            this.log('Received ListTools request');
            return {
                tools: [
                    {
                        name: 'puppeteer_launch',
                        description: 'Launch a new Puppeteer browser instance or connect to existing Chrome with remote debugging',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                headless: { type: 'boolean', default: true },
                                args: { type: 'array', items: { type: 'string' } },
                                executablePath: { type: 'string', description: 'Path to Chrome executable' },
                                browserWSEndpoint: { type: 'string', description: 'WebSocket endpoint for existing Chrome instance (e.g., ws://localhost:9222)' },
                                userDataDir: { type: 'string', description: 'Path to user data directory' },
                                userAgent: { type: 'string', description: 'Custom user agent string' },
                                viewport: {
                                    type: 'object',
                                    properties: {
                                        width: { type: 'number', default: 1366 },
                                        height: { type: 'number', default: 768 },
                                        deviceScaleFactor: { type: 'number', default: 1 },
                                        isMobile: { type: 'boolean', default: false },
                                        hasTouch: { type: 'boolean', default: false },
                                        isLandscape: { type: 'boolean', default: true }
                                    }
                                },
                                proxy: {
                                    type: 'object',
                                    properties: {
                                        server: { type: 'string' },
                                        username: { type: 'string' },
                                        password: { type: 'string' }
                                    }
                                },
                                stealth: { type: 'boolean', default: false, description: 'Enable stealth mode to avoid detection' },
                                slowMo: { type: 'number', description: 'Delay between actions in milliseconds' }
                            },
                        },
                    },
                    {
                        name: 'puppeteer_new_page',
                        description: 'Create a new page in the browser',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string', description: 'Unique identifier for the page' },
                            },
                            required: ['pageId'],
                        },
                    },
                    {
                        name: 'puppeteer_navigate',
                        description: 'Navigate to a URL',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                url: { type: 'string' },
                                waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'] },
                            },
                            required: ['pageId', 'url'],
                        },
                    },
                    {
                        name: 'puppeteer_click',
                        description: 'Click on an element',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                selector: { type: 'string' },
                            },
                            required: ['pageId', 'selector'],
                        },
                    },
                    {
                        name: 'puppeteer_type',
                        description: 'Type text into an element',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                selector: { type: 'string' },
                                text: { type: 'string' },
                            },
                            required: ['pageId', 'selector', 'text'],
                        },
                    },
                    {
                        name: 'puppeteer_get_text',
                        description: 'Get text content from an element',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                selector: { type: 'string' },
                            },
                            required: ['pageId', 'selector'],
                        },
                    },
                    {
                        name: 'puppeteer_screenshot',
                        description: 'Take a screenshot of the page',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                path: { type: 'string' },
                                fullPage: { type: 'boolean', default: false },
                            },
                            required: ['pageId'],
                        },
                    },
                    {
                        name: 'puppeteer_evaluate',
                        description: 'Execute JavaScript in the page context',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                script: { type: 'string' },
                            },
                            required: ['pageId', 'script'],
                        },
                    },
                    {
                        name: 'puppeteer_wait_for_selector',
                        description: 'Wait for a selector to appear',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                selector: { type: 'string' },
                                timeout: { type: 'number', default: 30000 },
                            },
                            required: ['pageId', 'selector'],
                        },
                    },
                    {
                        name: 'puppeteer_close_page',
                        description: 'Close a specific page',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                            },
                            required: ['pageId'],
                        },
                    },
                    {
                        name: 'puppeteer_close_browser',
                        description: 'Close the browser and all pages',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'puppeteer_set_cookies',
                        description: 'Set cookies for a page',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                cookies: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            value: { type: 'string' },
                                            domain: { type: 'string' },
                                            path: { type: 'string', default: '/' },
                                            expires: { type: 'number' },
                                            httpOnly: { type: 'boolean', default: false },
                                            secure: { type: 'boolean', default: false },
                                            sameSite: { type: 'string', enum: ['Strict', 'Lax', 'None'] }
                                        },
                                        required: ['name', 'value']
                                    }
                                }
                            },
                            required: ['pageId', 'cookies'],
                        },
                    },
                    {
                        name: 'puppeteer_get_cookies',
                        description: 'Get cookies from a page',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                urls: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['pageId'],
                        },
                    },
                    {
                        name: 'puppeteer_delete_cookies',
                        description: 'Delete cookies from a page',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                cookies: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            domain: { type: 'string' },
                                            path: { type: 'string' }
                                        },
                                        required: ['name']
                                    }
                                }
                            },
                            required: ['pageId', 'cookies'],
                        },
                    },
                    {
                        name: 'puppeteer_set_request_interception',
                        description: 'Enable request/response interception for a page',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                pageId: { type: 'string' },
                                enable: { type: 'boolean', default: true },
                                blockResources: {
                                    type: 'array',
                                    items: { type: 'string', enum: ['document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other'] },
                                    description: 'Resource types to block'
                                },
                                modifyHeaders: {
                                    type: 'object',
                                    description: 'Headers to add/modify in requests'
                                }
                            },
                            required: ['pageId'],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            this.log(`Received CallTool request: ${name} with args: ${JSON.stringify(args)}`);
            try {
                switch (name) {
                    case 'puppeteer_launch':
                        return await this.handleLaunch(args);
                    case 'puppeteer_new_page':
                        return await this.handleNewPage(args);
                    case 'puppeteer_navigate':
                        return await this.handleNavigate(args);
                    case 'puppeteer_click':
                        return await this.handleClick(args);
                    case 'puppeteer_type':
                        return await this.handleType(args);
                    case 'puppeteer_get_text':
                        return await this.handleGetText(args);
                    case 'puppeteer_screenshot':
                        return await this.handleScreenshot(args);
                    case 'puppeteer_evaluate':
                        return await this.handleEvaluate(args);
                    case 'puppeteer_wait_for_selector':
                        return await this.handleWaitForSelector(args);
                    case 'puppeteer_close_page':
                        return await this.handleClosePage(args);
                    case 'puppeteer_close_browser':
                        return await this.handleCloseBrowser(args);
                    case 'puppeteer_set_cookies':
                        return await this.handleSetCookies(args);
                    case 'puppeteer_get_cookies':
                        return await this.handleGetCookies(args);
                    case 'puppeteer_delete_cookies':
                        return await this.handleDeleteCookies(args);
                    case 'puppeteer_set_request_interception':
                        return await this.handleSetRequestInterception(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        });
    }
    async handleLaunch(args) {
        const { headless = true, args: browserArgs = [], executablePath, browserWSEndpoint, userDataDir, userAgent, viewport, proxy, stealth = false, slowMo } = args;
        if (this.browser) {
            await this.browser.close();
        }
        // Store viewport for later use in new pages
        this.currentViewport = viewport || null;
        let launchOptions = {
            headless,
            slowMo,
            args: [...browserArgs, '--no-sandbox', '--disable-setuid-sandbox'],
            // Set defaultViewport to apply to all new pages
            // null = disable device emulation, use actual window size
            defaultViewport: viewport || null,
        };
        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }
        if (userDataDir) {
            launchOptions.userDataDir = userDataDir;
        }
        if (stealth) {
            launchOptions.args.push('--disable-blink-features=AutomationControlled', '--disable-features=VizDisplayCompositor', '--disable-web-security', '--disable-features=site-per-process', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--disable-default-apps', '--disable-popup-blocking');
        }
        if (proxy?.server) {
            launchOptions.args.push(`--proxy-server=${proxy.server}`);
        }
        if (browserWSEndpoint) {
            this.browser = await puppeteer_1.default.connect({
                browserWSEndpoint,
                // Disable default viewport when connecting to existing browser
                defaultViewport: viewport || null,
            });
        }
        else {
            this.browser = await puppeteer_1.default.launch(launchOptions);
        }
        if (viewport || userAgent || stealth) {
            const pages = await this.browser.pages();
            if (pages.length > 0) {
                const page = pages[0];
                if (viewport) {
                    await page.setViewport(viewport);
                }
                if (userAgent) {
                    await page.setUserAgent(userAgent);
                }
                else if (stealth) {
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                }
                if (stealth) {
                    await page.evaluateOnNewDocument(`() => {
            Object.defineProperty(navigator, 'webdriver', { 
              get: () => undefined,
              configurable: true 
            });
            Object.defineProperty(navigator, 'plugins', { 
              get: () => [1, 2, 3, 4, 5],
              configurable: true 
            });
            Object.defineProperty(navigator, 'languages', { 
              get: () => ['en-US', 'en'],
              configurable: true 
            });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'permissions', {
              get: () => ({
                query: () => Promise.resolve({ state: 'granted' })
              }),
              configurable: true
            });
          }`);
                }
            }
        }
        const connectionMethod = browserWSEndpoint ? 'Connected to existing browser' : 'Browser launched';
        return {
            content: [
                {
                    type: 'text',
                    text: `${connectionMethod} successfully`,
                },
            ],
        };
    }
    async handleNewPage(args) {
        const { pageId } = args;
        if (!this.browser) {
            throw new Error('Browser not launched. Call puppeteer_launch first.');
        }
        const page = await this.browser.newPage();
        // Apply stored viewport to new page (as additional safeguard)
        if (this.currentViewport) {
            await page.setViewport(this.currentViewport);
        }
        this.pages.set(pageId, page);
        return {
            content: [
                {
                    type: 'text',
                    text: `Page ${pageId} created successfully`,
                },
            ],
        };
    }
    async handleNavigate(args) {
        const { pageId, url, waitUntil = 'load' } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.goto(url, { waitUntil });
        return {
            content: [
                {
                    type: 'text',
                    text: `Navigated to ${url}`,
                },
            ],
        };
    }
    async handleClick(args) {
        const { pageId, selector } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.click(selector);
        return {
            content: [
                {
                    type: 'text',
                    text: `Clicked on ${selector}`,
                },
            ],
        };
    }
    async handleType(args) {
        const { pageId, selector, text } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.type(selector, text);
        return {
            content: [
                {
                    type: 'text',
                    text: `Typed "${text}" into ${selector}`,
                },
            ],
        };
    }
    async handleGetText(args) {
        const { pageId, selector } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        const element = await page.$(selector);
        if (!element) {
            throw new Error(`Element ${selector} not found`);
        }
        const text = await page.evaluate((el) => el.textContent, element);
        return {
            content: [
                {
                    type: 'text',
                    text: `Text from ${selector}: ${text}`,
                },
            ],
        };
    }
    async handleScreenshot(args) {
        const { pageId, path, fullPage = false } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        const screenshot = await page.screenshot({
            path,
            fullPage,
            type: 'png'
        });
        return {
            content: [
                {
                    type: 'text',
                    text: path ? `Screenshot saved to ${path}` : 'Screenshot taken',
                },
            ],
        };
    }
    async handleEvaluate(args) {
        const { pageId, script } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        const result = await page.evaluate(script);
        return {
            content: [
                {
                    type: 'text',
                    text: `Script result: ${JSON.stringify(result)}`,
                },
            ],
        };
    }
    async handleWaitForSelector(args) {
        const { pageId, selector, timeout = 30000 } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.waitForSelector(selector, { timeout });
        return {
            content: [
                {
                    type: 'text',
                    text: `Selector ${selector} appeared`,
                },
            ],
        };
    }
    async handleClosePage(args) {
        const { pageId } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.close();
        this.pages.delete(pageId);
        return {
            content: [
                {
                    type: 'text',
                    text: `Page ${pageId} closed`,
                },
            ],
        };
    }
    async handleCloseBrowser(args) {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.pages.clear();
        }
        return {
            content: [
                {
                    type: 'text',
                    text: 'Browser closed',
                },
            ],
        };
    }
    async handleSetCookies(args) {
        const { pageId, cookies } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.setCookie(...cookies);
        return {
            content: [
                {
                    type: 'text',
                    text: `Set ${cookies.length} cookie(s) for page ${pageId}`,
                },
            ],
        };
    }
    async handleGetCookies(args) {
        const { pageId, urls } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        const cookies = urls ? await page.cookies(...urls) : await page.cookies();
        return {
            content: [
                {
                    type: 'text',
                    text: `Retrieved cookies: ${JSON.stringify(cookies, null, 2)}`,
                },
            ],
        };
    }
    async handleDeleteCookies(args) {
        const { pageId, cookies } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.deleteCookie(...cookies);
        return {
            content: [
                {
                    type: 'text',
                    text: `Deleted ${cookies.length} cookie(s) from page ${pageId}`,
                },
            ],
        };
    }
    async handleSetRequestInterception(args) {
        const { pageId, enable = true, blockResources = [], modifyHeaders = {} } = args;
        const page = this.pages.get(pageId);
        if (!page) {
            throw new Error(`Page ${pageId} not found`);
        }
        await page.setRequestInterception(enable);
        if (enable) {
            page.on('request', (request) => {
                const resourceType = request.resourceType();
                if (blockResources.includes(resourceType)) {
                    request.abort();
                    return;
                }
                const headers = { ...request.headers(), ...modifyHeaders };
                request.continue({ headers });
            });
        }
        return {
            content: [
                {
                    type: 'text',
                    text: `Request interception ${enable ? 'enabled' : 'disabled'} for page ${pageId}`,
                },
            ],
        };
    }
    async run() {
        this.log('Starting MCP server...');
        try {
            const transport = new stdio_js_1.StdioServerTransport();
            this.log('Created StdioServerTransport');
            await this.server.connect(transport);
            this.log('Successfully connected to transport');
            console.error('MCP Puppeteer server running on stdio');
            this.log('Server is now running and ready to receive requests');
        }
        catch (error) {
            this.log(`Failed to start server: ${error}`);
            throw error;
        }
    }
}
const server = new PuppeteerMCPServer();
server.run().catch((error) => {
    server['log'](`Fatal error: ${error.stack}`);
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map