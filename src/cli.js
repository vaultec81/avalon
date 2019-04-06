var config = require('./config.js').read(0)
var TransactionType = require('./transactionType.js')
var cmds = require('./clicmds.js')
var program = require('commander')
const { randomBytes } = require('crypto')
const secp256k1 = require('secp256k1')
const bs58 = require('base-x')(config.b58Alphabet)
var fetch = require('node-fetch')
var fs = require('fs')
const defaultPort = 3001

program
    .version('0.2.0', '-V, --version')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .option('-S, --spam [delay_in_ms]', 'repeats the tx every delay')
    
program
    .command('keypair')
    .description('generate a new keypair')
    .alias('key')
    .option('-P, --prefix [prefix]', 'public key prefix')
    .action(function(options) {
        var prefix = (options.prefix || '')
        var priv
        var pub
        var pub58
        do {
            priv = randomBytes(config.randomBytesLength)
            pub = secp256k1.publicKeyCreate(priv)
            pub58 = bs58.encode(pub)
        } while (!pub58.startsWith(prefix) || !secp256k1.privateKeyVerify(priv))

        writeLine(JSON.stringify({
            pub: pub58,
            priv: bs58.encode(priv)
        }))
    })

program
    .command('sign <transaction>')
    .description('sign a transaction w/o broadcasting')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .action(function(transaction) {
        verifyKeyAndUser()
        writeLine(JSON.stringify(cmds.sign(program.key, program.me, transaction)))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ sign \'{"type":1,"data":{"target":"bob"}}\' -F key.json -M alice')
    })

program
    .command('account <pub_key> <new_user>')
    .description('create a new account')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(pubKey, newUser) {
        verifyKeyAndUser()
        sendTx(cmds.createAccount(program.key, program.me, pubKey, newUser))
    }).on('--help', function(){
        writeLine('')
        writeLine('Extra Info:')
        writeLine('  Account creation will burn coins depending on the chain config')
        writeLine('  However, usernames matching public key are free (see second example)')
        writeLine('')
        writeLine('Examples:')
        writeLine('  $ account d2EdJPNgFBwd1y9vhMzxw6vELRneC1gSHVEjguTG74Ce cool-name -F key.json -M alice')
        writeLine('  $ account fR3e4CcvMRuv8yaGtoQ6t6j1hxfyocqhsKHi2qP9mb1E fr3e4ccvmruv8yagtoq6t6j1hxfyocqhskhi2qp9mb1e -F key.json -M alice')
    })

program
    .command('vote-leader <leader>')
    .description('vote for a leader')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(leader) {
        verifyKeyAndUser()
        sendTx(cmds.approveNode(program.key, program.me, leader))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ vote-leader bob -F key.json -M alice')
    })

program
    .command('unvote-leader <leader>')
    .description('remove a leader vote')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(leader) {
        verifyKeyAndUser()
        sendTx(cmds.disapproveNode(program.key, program.me, leader))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ unvote-leader bob -F key.json -M alice')
    })

program
    .command('transfer <receiver> <amount>')
    .alias('xfer')
    .description('transfer coins')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(receiver, amount) {
        verifyKeyAndUser()
        sendTx(cmds.transfer(program.key, program.me, receiver, amount))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ transfer bob 777 -F key.json -M alice')
    })

program
    .command('comment <link> <pa> <pp> <json> <vt> <tag>')
    .description('publish a new JSON content')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(link, pa, pp, json, vt, tag) {
        verifyKeyAndUser()
        sendTx(cmds.comment(program.key, program.me, link, pa, pp, json, vt, tag))
    }).on('--help', function(){
        writeLine('')
        writeLine('Arguments:')
        writeLine('  <link>: an arbitrary string identifying your content')        
        writeLine('  <pa>: parent author (if you are replying to another comment)')
        writeLine('  <pp>: parent link (if you are replying to another comment)')
        writeLine('  <json>: a json object')
        writeLine('  <vt>: the amount of VT to spend on the forced vote')
        writeLine('  <tag>: the tag of the forced vote')
        writeLine('')
        writeLine('Examples:')
        writeLine('  $ comment root-comment \'\' \'\' \'{"body": "Hello World"}\' 777 my-tag -F key.json -M alice')
        writeLine('  $ comment reply-to-bob bobs-post bob \'{"body": "Hello Bob"}\' 1 my-tag -F key.json -M alice')
    })

program
    .command('profile <json>')
    .alias('userJson')
    .description('modify an account profile')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(json) {
        verifyKeyAndUser()
        sendTx(cmds.profile(program.key, program.me, json))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ profile \'{"profile":{"avatar":"https://i.imgur.com/4Bx2eQt.jpg"}}\' -F key.json -M bob')
    })

program
    .command('follow <target>')
    .alias('subscribe')
    .description('start following another user')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(target) {
        verifyKeyAndUser()
        sendTx(cmds.follow(program.key, program.me, target))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ follow bob -F key.json -M alice')
    })

program
    .command('unfollow <target>')
    .alias('unsubscribe')
    .description('stop following another user ')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(target) {
        verifyKeyAndUser()
        sendTx(cmds.unfollow(program.key, program.me, target))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ unfollow bob -F key.json -M alice')
    })

program
    .command('new-key <id> <pub> <allowed_txs>')
    .description('add new key with custom perms')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(id, pub, allowedTxs) {
        verifyKeyAndUser()
        sendTx(cmds.newKey(program.key, program.me, id, pub, allowedTxs))
    }).on('--help', function(){
        writeLine('')
        writeLine('Transaction Types:')
        for (const key in TransactionType)
            writeLine('  '+TransactionType[key]+': '+key)
        writeLine('')
        writeLine('Examples:')
        writeLine('  $ new-key posting tWWLqc5wPTbXPaWrFAfqUwGtEBLmUbyavp3utwPUop2g [4,5,6,7,8] -F key.json -M alice')
        writeLine('  $ new-key finance wyPSnqfmAKoz5gAWyPcND7Rot6es2aFgcDGDTYB89b4q [3] -F key.json -M alice')
    })

program
    .command('remove-key <id>')
    .description('remove a previously added key')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(id) {
        verifyKeyAndUser()
        sendTx(cmds.removeKey(program.key, program.me, id))
    }).on('--help', function(){
        writeLine('')
        writeLine('Example:')
        writeLine('  $ remove-key posting -F key.json -M alice')
    })

program
    .command('change-password <pub>')
    .description('change the master key of an account')
    .option('-K, --key [plaintext_key]', 'plain-text private key')
    .option('-F, --file [file_key]', 'file private key')
    .option('-M, --me [my_username]', 'username of the transactor')
    .option('-A, --api [api_url]', 'avalon api url')
    .action(function(pub) {
        verifyKeyAndUser()
        sendTx(cmds.changePassword(program.key, program.me, pub))
    }).on('--help', function(){
        writeLine('')
        writeLine('Arguments:')
        writeLine('  <pub>: the new public key that will have full control over your account')
        writeLine('')
        writeLine('WARNING:')
        writeLine('  DO NOT lose the new associated private key!')
        writeLine('')
        writeLine('Example:')
        writeLine('  $ change-password tK9DqTygrcwGWZPsyVtZXNpfiZcAZN83nietKbKY8aiH -F key.json -M alice')
    })   

program.parse(process.argv)

function writeLine(str){process.stdout.write(str+'\n')}

function sendTx(tx) {
    var port = process.env.API_PORT || defaultPort
    var ip = process.env.API_IP || '[::1]'
    var protocol = process.env.API_PROTOCOL || 'http'
    var url = protocol+'://'+ip+':'+port+'/transact'
    if (program.api)
        url = program.api+'/transact'
    fetch(url, {
        method: 'post',
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(tx)
    }).then(function(res) {
        if (res.statusText !== 'OK')
            writeLine('Err: ' + res.statusText)
    }).catch(function(error) {
        writeLine('Err: ' + error)
    })
    if (program.spam && program.spam > 0)
        setTimeout(function(){sendTx(tx)}, program.spam)
}

function verifyKeyAndUser() {
    if (program.file) {
        var file = fs.readFileSync(program.file, 'utf8')
        try {
            program.key = JSON.parse(file).priv
        } catch (error) {
            program.key = file.trim()
        }
    }
    if (!program.key) {
        writeLine('no key?')
        process.exit()
    }
    if (!program.me) {
        writeLine('no user?')
        process.exit()
    }
}
