import {
    StorybookConnection,
    StoriesBrowser,
    StoryPreviewBrowser,
    MetricsWatcher,
    createExecutionService,
    Story,
} from 'storycrawler';

import { writeFile } from 'fs';
import { JSDOM } from 'jsdom';

type FetchResult = { story: Story; outerHTML: string | undefined };

const getConnection = async (storybookUrl: string) => {
    return await new StorybookConnection({
        storybookUrl,
    }).connect();
};

const getOuterHTML: (
    story: Story
) => (worker: StoryPreviewBrowser) => Promise<FetchResult> =
    (story) => async (worker) => {
        await worker.setCurrentStory(story);
        await new MetricsWatcher(worker.page).waitForStable();
        const pageHandle = await worker.page.$('#root');
        const outerHTMLHandle = await pageHandle?.getProperty('outerHTML');
        const outerHTML = await outerHTMLHandle?.jsonValue<string>();
        return { story, outerHTML };
    };

const writeResultToHtmlFile = (result: FetchResult) => {
    if (result.outerHTML) {
        console.log('id:', result.story.id);
        console.log('outerHTML:', result.outerHTML);
        const jsdom = new JSDOM();
        const parser = new jsdom.window.DOMParser();
        const parsedDom = parser.parseFromString(result.outerHTML, 'text/html');
        writeFile(
            `rendered/${result.story.id}.html`,
            parsedDom.documentElement.outerHTML,
            (err) => {
                throw err;
            }
        );
    }
};

(async function () {
    const storybookUrl = 'https://storybookjs.netlify.app/vue-kitchen-sink';
    const connection = await getConnection(storybookUrl);
    console.log(`connected to ${storybookUrl}`);
    const storiesBrowser = await new StoriesBrowser(connection).boot();
    const stories = await storiesBrowser.getStories();
    console.log(`found ${stories.length} stories`);
    const workers = await Promise.all(
        [0, 1, 2, 3].map((i) => new StoryPreviewBrowser(connection, i).boot())
    );

    try {
        const service = createExecutionService(workers, stories, getOuterHTML);
        const results = await service.execute();
        results.forEach(writeResultToHtmlFile);
    } finally {
        await storiesBrowser.close();
        await Promise.all(workers.map((worker) => worker.close()));
        await connection.disconnect();
    }
})();
