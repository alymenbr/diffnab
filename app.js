var express = require('express'); //Express Web Server 
var busboy = require('connect-busboy'); //middleware for form/file upload
var path = require('path'); //used for file path
var fs = require('fs-extra'); //File System - for file manipulation
var parse = require('csv-parse');
var _ = require('underscore');
var csv = require('csv');

var app = express();
app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));


app.route('/upload').post(function(req, res, next) {
    _response = res;

    var ynabFileName = null;
    var bankFileName = null;

    var uploadDir = __dirname + '/temp/';
    fs.ensureDir(uploadDir, function(err) {

        var filesCount = 0;
        var fstream;
        req.pipe(req.busboy);
        req.busboy.on('file', function(fieldname, file, filename) {
            console.log("Uploading " + fieldname + ": " + filename);

            if (fieldname == 'ynabFile')
                ynabFileName = filename;

            if (fieldname == 'bankFile')
                bankFileName = filename;

            //Path where file will be uploaded
            fstream = fs.createWriteStream(__dirname + '/temp/' + filename);
            file.pipe(fstream);
            fstream.on('close', function() {
                console.log("Upload Finished of " + filename);

                filesCount++;
                if (filesCount == 2)
                    doYourThing(ynabFileName, bankFileName, res); //where to go next
            });
        });
    });
});

var server = app.listen((process.env.PORT || 5000), function() {
    console.log('Listening on port %d', server.address().port);
});


function doYourThing(ynabFileName, bankFileName, response) {
    var ynabContent = fs.readFileSync(__dirname + "/temp/" + ynabFileName);
    var bankContent = fs.readFileSync(__dirname + "/temp/" + bankFileName);

    // REMOVE TEMP FILES
    fs.unlinkSync(__dirname + '/temp/' + ynabFileName);
    fs.unlinkSync(__dirname + '/temp/' + bankFileName);

    step_parseYnab(ynabContent, bankContent, response);
}

function step_parseYnab(ynabContent, bankContent, response) {
    parse(ynabContent.toString(), {
        delimiter: '\t'
    }, function(err, output) {
        var ynabParsed = output.slice(1, output.length); // remove header

        step_parseBank(ynabParsed, bankContent, response);
    });
}

function step_parseBank(ynabParsed, bankContent, response) {
    parse(bankContent.toString(), {
        delimiter: ','
    }, function(err, output) {
        var bankParsed = output.slice(1, output.length); // remove header
        bankParsed.pop(); // remove summary

        removeUnwantedBankLines(bankParsed);

        step_calcInserts(ynabParsed, bankParsed, response);
    });
}

function step_calcInserts(ynabParsed, bankParsed, response) {

    var insertList = [];
    _.each(bankParsed, function(bankLine) {
        var isMissing = isBankLineMissing(bankLine, ynabParsed);

        if (isMissing) {
            var data = getBankLineData(bankLine);
            insertList.push(data);
        }
    });

    step_generateResponse(insertList, response);
}

function step_generateResponse(insertList, response) {

    var content = "Date,Payee,Category,Memo,Outflow,Inflow\n";

    _.each(insertList, function(line) {
        if (line.valor > 0)
            content += line.data + ",DIFF,," + line.info + ",," + line.valor + "\n";
        else
            content += line.data + ",DIFF,," + line.info + "," + Math.abs(line.valor) + ",\n";
    });

    response.attachment('result.csv');
    response.end(content, 'binary');
}





function removeUnwantedBankLines(bankParsed) {
    var i = 0;
    var length = bankParsed.length;

    for (; i < length; i++) {
        var element = bankParsed[i];
        var description = element[2];
        if (description == 'Saldo Anterior') {
            bankParsed.splice(i, 1); //remove element
            i = -1;
            length--;
        }

        if (description.substring(0, 10) == 'Renda Fixa') {
            bankParsed.splice(i, 1); //remove element
            i = -1;
            length--;
        }
    }
}

function isBankLineMissing(bankLine, ynabParsed) {
    var result = true;

    _.each(ynabParsed, function(ynabLine) {
        var isEqual = compareLines(bankLine, ynabLine);

        if (isEqual)
            result = false;
    });

    return result;
}

function compareLines(bankLine, ynabLine) {
    var bankData = getBankLineData(bankLine);
    var ynabData = getYnabLineData(ynabLine);
    var result = false;


    if (bankData.dia == ynabData.dia &&
        bankData.mes == ynabData.mes &&
        bankData.ano == ynabData.ano &&
        bankData.valor == ynabData.valor)
        result = true;

    return result;
}

// return {dia, mes, ano, data, valor, info}
function getBankLineData(line) {
    var result = {};

    result.dia = line[0].substring(3, 5); // 30 from 09/30/2014 
    result.mes = line[0].substring(0, 2); // 09 from 09/30/2014
    result.ano = line[0].substring(6, 10); // 2014 from 09/30/2014
    result.data = result.dia + "/" + result.mes + "/" + result.ano;
    result.info = line[2];

    result.valor = line[5];
    result.valor = parseFloat(result.valor); // -398.81 as float

    return result;
}

// return {dia, mes, ano, data, valor, info}
function getYnabLineData(line) {
    var result = {};


    result.dia = line[3].substring(0, 2); // 30 from 30/09/2014 
    result.mes = line[3].substring(3, 5); // 30 from 30/09/2014 
    result.ano = line[3].substring(6, 10); // 30 from 30/09/2014 
    result.data = result.dia + "/" + result.mes + "/" + result.ano;
    result.info = line[7] + ':' + line[8]; // MEMO column

    // OUTFLOW
    if (line[9] != "R$0,00")
        result.valor = '-' + line[9].substring(2, line[9].length); // R$249,90 into -249,90

    // INFLOW
    if (line[10] != "R$0,00")
        result.valor = line[10].substring(2, line[9].length); // R$249,90 into 249,90    

    result.valor = result.valor.replace(',', '.'); // 249,90 into 249.90
    result.valor = parseFloat(result.valor); // 249.90 as float

    return result;
}