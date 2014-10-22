var express = require('express'); //Express Web Server 
var busboy = require('connect-busboy'); //middleware for form/file upload
var path = require('path'); //used for file path
var fs = require('fs-extra'); //File System - for file manipulation
var parse = require('csv-parse');

var app = express();
app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));


var ynabFileName = null;
var bankFileName = null;
/* ========================================================== 
Create a Route (/upload) to handle the Form submission 
(handle POST requests to /upload)
Express v4  Route definition
============================================================ */
app.route('/upload').post(function(req, res, next) {

    var filesCount = 0;
    var fstream;
    req.pipe(req.busboy);
    req.busboy.on('file', function(fieldname, file, filename) {
        console.log("Uploading " + fieldname + ": " + filename);

        if (fieldname == 'ynabFile')
            ynabFileName = filename;

        if (fieldname == 'bankFile')
            bankFileName = filename;

        //Path where image will be uploaded
        fstream = fs.createWriteStream(__dirname + '/uploads/' + filename);
        file.pipe(fstream);
        fstream.on('close', function() {
            console.log("Upload Finished of " + filename);

            filesCount++;
            if (filesCount == 2)
                res.redirect('/doYourThing'); //where to go next
        });
    });
});


/// Show files
app.get('/doYourThing', function(req, res) {
    var ynabContent = fs.readFileSync(__dirname + "/uploads/" + ynabFileName);
    var bankContent = fs.readFileSync(__dirname + "/uploads/" + bankFileName);

    doYourThing(ynabContent, bankContent);
});



var server = app.listen(8080, function() {
    console.log('Listening on port %d', server.address().port);
});


function doYourThing(ynabContent, bankContent) {

    step_parseYnab(ynabContent, bankContent);
}

function step_parseYnab(ynabContent, bankContent, next) {
    parse(ynabContent.toString(), {
        delimiter: '\t'
    }, function(err, output) {
        var ynabParsed = output.splice(0, 1); // remove header
        ynabParsed = ynab.pop(); // remove empty line

        step_parseBank(ynabParsed, bankContent);
    });
}

function step_parseBank(ynabParsed, bankContent) {
    parse(bankContent.toString(), {
        delimiter: ','
    }, function(err, output) {
        var bankParsed = output.splice(0, 1); // remove header
        bankParsed = bankParsed.pop(); // remove empty line
        bankParsed = bankParsed.pop(); // remove summary line

        step_calcInserts(ynabParsed, bankParsed);
    });
}

function step_calcInserts(ynabParsed, bankParsed) {

    var insertList = [];
    _.each(bankParsed, function(bankLine) {
        var isMissing = isBankLineMissing(bankLine, ynabParsed);

        if (isMissing) {
            var data = getBankLineData(bankLine);
            insertlist.push(data);
        }
    });

    step_calcRemovals(ynabParsed, bankParsed, insertList);
}


function isBankLineMissing(bankLine, ynabParsed) {

    _.each(ynabParsed, function(ynabLine) {
        var isEqual = compareLines(bankLine, ynabLine);

        if (isEqual)
            return false;
    });

    return true;
}

function isYnabLineMissing(ynabLine, bankParsed) {

    _.each(bankParsed, function(bankLine) {
        var isEqual = compareLines(bankLine, ynabLine);

        if (isEqual)
            return false;
    });

    return true;
}


function compareLines(bankLine, ynabLine) {
    var bankData = getBankLineData(bankLine);
    var ynabData = getYnabLineData(bankLine);

    if (bankData.dia == ynabData.dia &&
        bankData.mes == ynabData.mes &&
        bankData.ano == ynabData.ano &&
        bankData.valor == ynabData.valor)
        return true;

    return false;
}

// return {dia, mes, ano, data, valor, info}
function getBankLineData(line) {
    var data = {};

    data.dia = line[0].substring(4, 6); // 30 from "09/30/2014" 
    data.mes = line[0].substring(1, 3); // 09 from "09/30/2014" 
    data.ano = line[0].substring(7, 11); // 2014 from "09/30/2014"
    data.data = data.dia + "/" + data.mes + "/" + data.ano;
    data.info = line[2];

    data.valor = line[5].slice(1, -1); // -398.81 from "-398.81"
    data.valor = parseFloat(data.valor); // -398.81 as float


    console.log('getBankLineData: ' + data);
    return data;
}

// return {dia, mes, ano, data, valor, info}
function getYnabLineData(line) {
    var data = {};

    data.dia = line[3].substring(0, 2); // 30 from 30/09/2014 
    data.mes = line[3].substring(3, 5); // 30 from 30/09/2014 
    data.ano = line[3].substring(6, 10); // 30 from 30/09/2014 
    data.data = data.dia + "/" + data.mes + "/" + data.ano;
    data.info = line[7]; // MEMO column

    // OUTFLOW
    if (line[8] != "R$0,00")
        data.valor = '-' + line[8].slice(2, 0); // R$249,90 into -249,90

    // INFLOW
    if (line[9] != "R$0,00")
        data.valor = line[9].slice(2, 0); // R$249,90 into 249,90    

    data.valor = data.valor.replace(',', '.'); // 249,90 into 249.90
    data.valor = parseFloat(data.valor); // 249.90 as float

    console.log('getYnabLineData: ' + data);
    return data;
}

function step_calcRemovals(ynabParsed, bankParsed, insertList) {

    var removalList = [];
    _.each(ynabParsed, function(ynabLine) {
        var isMissing = isYnabLineMissing(ynabLine, bankParsed);

        if (isMissing) {
            var data = getYnabLineData(ynabLine);
            removalList.push(data);
        }
    });

    step_generateResultContent(insertList, removalList);
}

function step_generateResultContent(insertList, removalList) {
    var content = "Date,Payee,Category,Memo,Outflow,Inflow\n";

    _.each(insertList, function(line) {
        if (line.valor > 0)
            content += line.data + ",DIFF,,ADD - " + line.info + ",," + line.valor + "\n";
        else
            content += line.data + ",DIFF,,ADD - " + line.info + "," + Math.abs(line.valor) + ",\n";
    });

    _.each(removalList, function(line) {
        if (line.valor > 0)
            content += line.data + ",DIFF,,REMOVE - " + line.info + ",," + line.valor + "\n";
        else
            content += line.data + ",DIFF,,REMOVE - " + line.info + "," + Math.abs(line.valor) + ",\n";
    });

    step_generateResultFile(content);
}

function step_generateResultFile(content) {

    var file = '/uploads/result.csv';

    fs.outputFileSync(file, content, function(err) {
        console.log(err); //null


        fs.readFileSync(file, 'utf8', function(err, savedFile) {

            // RESPONSE
            res.writeHead(200, {
                'Content-Type': 'text/csv'
            });
            res.end(savedFile, 'binary');
        });
    });
}