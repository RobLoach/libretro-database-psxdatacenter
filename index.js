const puppeteer = require('puppeteer');
const titleCase = require('title-case')
const fs = require('fs')
const pkg = require('./package.json')
const sortArray = require('sort-array')
const moment = require('moment')

/**
 * Index of the databases and their URLs.
 */
let databases = {
	'Sony - PlayStation Portable': [
		'https://psxdatacenter.com/psp/ulist.html',
		'https://psxdatacenter.com/psp/jlist.html',
		'https://psxdatacenter.com/psp/plist.html'
	],
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
}

/**
 * Build the DAT's header info.
 */
function header(title, version, homepage) {
	return `clrmamepro (
	name "${title}"
	description "${title}"
	version "${version}"
	homepage "${homepage}"
)\n`
}

/**
 * Clean the given value to be DAT file safe.
 */
function cleanValue(val) {
	if (val && val.replace) {
		val = val.replace(new RegExp('"', 'g'), '\'')
	}
	if (val && val.trim) {
		val = val.trim()
	}
	return val
}

/**
 * Construct a DAT entry based on the given game.
 */
function datEntry(game) {
	gameEntries = ''
	if (game.description) {
		gameEntries += `\n	description "${cleanValue(game.description)}"`
	}
	if (game.developer) {
		gameEntries += `\n	developer "${cleanValue(game.developer)}"`
	}
	if (game.publisher) {
		gameEntries += `\n	publisher "${cleanValue(game.publisher)}"`
	}
	if (game.releaseyear) {
		gameEntries += `\n	releaseyear "${cleanValue(game.releaseyear)}"`
	}
	if (game.releasemonth) {
		gameEntries += `\n	releasemonth "${cleanValue(game.releasemonth)}"`
	}
	if (game.releaseday) {
		gameEntries += `\n	releaseday "${cleanValue(game.releaseday)}"`
	}
	if (game.users) {
		gameEntries += `\n	users "${cleanValue(game.users)}"`
	}
	if (game.genre) {
		gameEntries += `\n	genre "${cleanValue(game.genre)}"`
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
		image "${cleanValue(game.name)}.cue"
	)
)
`
}

/**
 * Quick clean of the given title.
 */
function cleanTitle(title) {
	if (!title) {
		return null
	}
	let output = title
	for (let i = 1; i < 10; i++) {
		output = output.replace(`-  [ ${i} DISCS ]`, '')
		output = output.replace(`[ ${i} DISCS ]`, '')
		output = output.replace(` ${i} DISCS`, '')
		output = output.replace(`-  [ ${i} Discs ]`, '')
		output = output.replace(`[ ${i} Discs ]`, '')
		output = output.replace(` ${i} Discs`, '')
	}
	
	// Manual title case fixes
	output = output
		.replace('shell', 'Shell')
		.replace('wheelman', 'Wheelman')
	
	// Clean up the outside whitespace
	output = output.trim()

	// Remove an end - if it's there.
	if (output[output.length - 1] === "-") {
		output = output.slice(0, -1);
	}
	return output.trim()
}

/**
 * Retrieve meta data about the given game.
 */
async function retrieveMeta(entry, url, page, serial) {
	if (entry.info) {

		let gameUrl = entry.info
		if (url.includes('psx2/')) {
			gameUrl = 'https://psxdatacenter.com/psx2/' + entry.info
		}
		else if (url.includes ('psp/')) {
			gameUrl = 'https://psxdatacenter.com/psp/' + entry.info
		}
		else {
			gameUrl = 'https://psxdatacenter.com/' + entry.info
		}
		console.log(entry.name)
		console.log('  ' + gameUrl)
		await page.goto(gameUrl)
		const data = await page.$$eval('#table19 tr, #table4 tr', function (rows) {
			let output = {}
			for (let row of rows) {
				let cells = row.innerText.split('\t')
				if (cells[0] && cells[0].toLowerCase) {
					let name = cells[0].toLowerCase().trim()
					if (cells[1] && cells[1].trim) {
						output[name] = cells[1].trim()
					}
				}
			}
			return output
		})

		let description = ''
		try {
			description = await page.$eval('#table16 td', function (td) {
				return td.innerText
			})
		}
		catch (e) {
			console.log("  Description not found.")
			description = ''
		}

		if (description && description.trim) {
			entry.description = description.trim().split('\n')[0].trim()
		}

		if (data['common title']) {
			entry.name = data['common title']
		}
		if (data['official title']) {
			entry.name = data['official title']
		}
		if (data['date released']) {
			try {
				let date = moment(data['date released'], 'D MMM YYYY')
				if (date.isValid()) {
					entry.releaseyear = date.format('YYYY')
					entry.releasemonth = date.format('M')
					entry.releaseday = date.format('D')
				}
			}
			catch (e) {
				console.log('  Date error: ' + data['date released'])
			}
		}
		if (data['developer']) {
			let dev = data['developer']
			// Strip the end period.
			if (dev[dev.length-1] === ".") {
    			dev = dev.slice(0,-1);
			}
			entry.developer = dev
		}
		if (data['publisher']) {
			let publisher = data['publisher']
			// Strip the end period.
			if (publisher[publisher.length - 1] === ".") {
    			publisher = publisher.slice(0, -1);
			}
			entry.publisher = publisher
		}
		if (data['number of players']) {
			for (let i = 9; i > 0; i--) {
				if (data['number of players'].includes(i.toString())) {
					entry.users = i
					break;
				}
			}
		}
		if (data['genre / style']) {
			let genre = data['genre / style']
			let genreLower = genre.toLowerCase()
			let genres = {
				'action': 'Action',
				'simulation': 'Simulation',
				'shooter': 'Shooter',
				'adventure': 'Adventure',
				'strategy': 'Strategy',
				'sports': 'Sports',
				'golf': 'Sports',
				'soccer': 'Sports',
				'baseball': 'Sports',
				'hockey': 'Sports',
				'fighter': 'Fighter',
				'basketball': 'Basketball',
				'rpg': 'RPG',
				'platform': 'Platform',
				'racing': 'Racing / Driving',
				'driving': 'Racing / Driving'
			}
			for (let currentGenre in genres) {
				if (genreLower.includes(currentGenre)) {
					genre = genres[currentGenre]
					break;
				}
			}
			entry.genre = genre
		}
	}
	return entry
}

/**
 * Scrap information and construct the DATs.
 */
async function constructDats() {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await page.setRequestInterception(true);

	// Disable loading images.
	page.on('request', request => {
		if (request.resourceType() == 'document') {
			request.continue();
		}
		else {
			request.abort();
		}
	});

	for (let databaseName in databases) {
		console.log(databaseName)
		let finalList = []
		let urls = databases[databaseName]
		for (let url of urls) {
			console.log(url)
			await page.goto(url);
			const entries = await page.$$eval('tr', function (rows, titleCase) {
				let output = []
				for (let row of rows) {
					let indexCount = 0
					let entry = {}
					let children = row.childNodes
					for (let child of children) {
						let nodeName = child.nodeName
						if (nodeName == "TD") {
							let outerHTML = child.outerHTML
							if (outerHTML.includes('"col1"') || outerHTML.includes('"col5"')) {
								let theMatch = child.outerHTML.match(/href="([^"]*)/)
								if (theMatch && theMatch[1]) {
									entry.info = theMatch[1]
								}
							}
							if (outerHTML.includes('"col2"') || outerHTML.includes('"col6"')) {
								entry.serial = child.innerText
							}
							if (outerHTML.includes('"col3"') || outerHTML.includes('"col7"')) {
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
				if (entry.name === null) {
					// TODO: Figure out what to do with defunked requests?
					continue
				}
				let serials = entry.serial.split('\n')
				let discNum = 0
				let title = ''
				for (let ser of serials) {

					if (discNum == 0) {
						entry = await retrieveMeta(entry, url, page, ser)
					}

					title = entry.name

					if (url.includes('plist')) {
						title += ' (Europe)'
					}
					else if (url.includes('ulist')) {
						title += ' (USA)'
					}
					else if (url.includes('jlist')) {
						title += ' (Japan)'
					}

					if (serials.length > 1) {
						title += ` (Disc ${++discNum} of ${serials.length})`
					}

					finalList.push({
						serial: ser,
						name: title,
						description: entry.description,
						releaseyear: entry.releaseyear,
						releasemonth: entry.releasemonth,
						releaseday: entry.releaseday,
						developer: entry.developer,
						publisher: entry.publisher,
						users: entry.users,
						genre: entry.genre
					})
				}
			}
		}

		let outputDat = header(databaseName, pkg.version, pkg.homepage)
		finalList = sortArray(finalList, ['name', 'serial'])
		for (let entry of finalList) {
			outputDat += datEntry(entry)
		}

		fs.writeFileSync('libretro-database/dat/' + databaseName + '.dat', outputDat)
	}



	await browser.close();
};

constructDats();
