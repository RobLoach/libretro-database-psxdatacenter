const puppeteer = require('puppeteer');
const titleCase = require('title-case')
const fs = require('fs')
const pkg = require('./package.json')
const sortArray = require('sort-array')
const moment = require('moment')

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
 * Clean the given value to be DAT file safe.
 */
function cleanValue(val) {
	return val.replace(new RegExp('"', 'g'), '\'')
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
	if (game.genre) {
		gameEntries += `\n	genre ${cleanValue(game.genre)}`
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

function cleanTitle(title) {
	output = title
	output = titleCase(output)
	output = output.trim()
	for (let i = 1; i < 10; i++) {
		output = output.replace(`-  [ ${i} Discs ]`, '')
		output = output.replace(`[ ${i} Discs ]`, '')
		output = output.replace(` ${i} Discs`, '')
	}
	return output.trim()
}

async function retrieveMeta(entry, url, page, serial) {
	if (entry.info) {
		console.log(entry.info)
		await page.goto('https://psxdatacenter.com/' + entry.info)
		const data = await page.$$eval('#table19 tr, #table4 tr', function (rows) {
			let output = {}
			for (let row of rows) {
				let cells = row.innerText.split('\t')
				let name = cells[0].toLowerCase().trim()
				output[name] = cells[1].trim()
			}
			return output
		})

		if (data['common title']) {
			entry.name = data['common title']
		}
		if (data['official title']) {
			entry.name = data['official title']
		}
		if (data['date released']) {
			try {
				let date = moment(data['date released'], 'D MMM YYYY')
				entry.releaseyear = date.format('YYYY')
				entry.releasemonth = date.format('M')
				entry.releaseday = date.format('D')
			}
			catch (e) {
				// Nothing.
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
			if (publisher[publisher.length-1] === ".") {
    			publisher = publisher.slice(0,-1);
			}
			entry.publisher = publisher
		}
		if (data['number of players']) {
			let num = data['number of players'].replace( /^\D+/g, '')
			if (num) {
				entry.users = num.trim()
			}
		}
		if (data['genre / style']) {
			let genre = data['genre / style']
			let genreLower = genre.toLowerCase()
			let genres = {
				'action': 'Action',
				'simulation': 'Simulation',
				'shooter': 'Shooter',
				'sports': 'Sports',
				'platform': 'Platform',
				'racing': 'Racing / Driving',
				'driving': 'Racing / Driving'
			}
			for (let currentGenre in genres) {
				console.log(currentGenre)
				if (genreLower.includes(currentGenre)) {
					genre = genres[currentGenre]
					break;
				}
			}
			entry.genre = genre
		}
	}
	console.log(entry)
	return entry
}

async function constructDats() {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();

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
							if (child.outerHTML.includes('"col1"')) {
								let theMatch = child.outerHTML.match(/href="([^"]*)/)
								if (theMatch && theMatch[1]) {
									entry.info = theMatch[1]
								}
							}
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
						name: title
					})
				}
			}
		}

		let outputDat = header(databaseName, pkg.version, pkg.homepage)
		finalList = sortArray(finalList, 'name')
		for (let entry of finalList) {
			outputDat += datEntry(entry)
		}

		fs.writeFileSync('libretro-database/dat/' + databaseName + '.dat', outputDat)
	}



	await browser.close();
};

constructDats();