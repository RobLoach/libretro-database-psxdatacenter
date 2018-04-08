const puppeteer = require('puppeteer');
const titleCase = require('title-case')
const fs = require('fs')

let databases = {
	'Sony - PlayStation': [
		'https://psxdatacenter.com/ulist.html',
		'https://psxdatacenter.com/jlist.html',
		'https://psxdatacenter.com/plist.html'
	],
	'Sony - PlayStation 2': [
		'https://psxdatacenter.com/psx2/ulist2.html',
		'https://psxdatacenter.com/psx2/jlist2.html',
		'https://psxdatacenter.com/psx2/plist2.html'
	],
	'Sony - PlayStation Portable': [
		'https://psxdatacenter.com/psp/ulist.html',
		'https://psxdatacenter.com/psp/jlist.html',
		'https://psxdatacenter.com/psp/plist.html'
	],
}

function header(title, version, homepage) {
	return `clrmamepro (
	name "${title}"
	description "${title}"
	version "${version}"
	homepage "${homepage}"
)\n`
}

/**
 * Construct a DAT entry based on the given game.
 */
function datEntry(game) {
	gameEntries = ''
	if (game.developer) {
		gameEntries += `\n	developer "${cleanValue(game.developer)}"`
	}
	if (game.publisher) {
		gameEntries += `\n	publisher "${cleanValue(game.publisher)}"`
	}
	if (game.releaseyear) {
		gameEntries += `\n	releaseyear ${cleanValue(game.releaseyear)}`
	}
	if (game.releasemonth) {
		gameEntries += `\n	releasemonth ${cleanValue(game.releasemonth)}`
	}
	if (game.releaseday) {
		gameEntries += `\n	releaseday ${cleanValue(game.releaseday)}`
	}
	if (game.users) {
		gameEntries += `\n	users ${cleanValue(game.users)}`
	}
	if (game.esrb_rating) {
		gameEntries += `\n	esrb_rating "${cleanValue(game.esrb_rating)}"`
	}
	return `
game (
	name "${cleanValue(game.name)}"
	serial "${game.serial}"${gameEntries}
	rom (
		serial "${cleanValue(game.serial)}"
	)
)
`
}

function cleanTitle(title) {
	output = title
	output = titleCase(output).trim()
	return output
}

async function constructDats() {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	for (let databaseName in databases) {
		let finalList = []
		let urls = databases[databaseName]
		for (let url of urls) {
			await page.goto(url);
			const entries = await page.$$eval('tr', function (rows, titleCase) {
				let output = []
				for (var row of rows) {
					let indexCount = 0
					let entry = {}
					let children = row.childNodes
					for (let child of children) {
						let nodeName = child.nodeName
						if (nodeName == "TD") {
							if (child.outerHTML.includes('"col2"')) {
								entry.serial = child.innerText
							}
							if (child.outerHTML.includes('"col3"')) {
								entry.name = child.innerText
							}
						}
					}
					if (Object.keys(entry).length !== 0) {
						output.push(entry);
					}
				}
				return output;
			}, titleCase)

			for (let entry of entries) {
				entry.name = cleanTitle(entry.name)
				let serials = entry.serial.split('\n')
				// TODO: Retrieve more meta information for the entry using serials[0]
				let discNum = 0
				let title = ''
				for (let ser of serials) {
					title = entry.name
					if (serials.length > 1) {
						title += ' (Disc ' + ++discNum + ')'
					}

					if (url.includes('plist')) {
						title += ' (Europe)'
					}
					else if (url.includes('ulist')) {
						title += ' (USA)'
					}
					else if (url.includes('jlist')) {
						title += ' (Japan)'
					}

					finalList.push({
						serial: ser,
						name: title
					})
				}
			}
		}
		console.log(finalList)
	}



	await browser.close();
};

constructDats();