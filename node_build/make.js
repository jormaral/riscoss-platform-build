var Spawn = require('child_process').spawn;
var nThen = require('nthen');
var Fs = require('fs');
var Walk = require('walkdir');
var XWiki = require('xwiki-tools');

var STDBUF = '/usr/bin/stdbuf';
var BASH = '/bin/bash';

var RDROUT = './riscoss-platform-core/riscoss-platform-rdr/riscoss-platform-rdr-war/' +
    'target/riscoss-platform-rdr-war-*-SNAPSHOT';
var DMOUT = './riscoss-platform-core/riscoss-platform-dm/riscoss-platform-dm-war/' +
    'target/riscoss-platform-dm-war-*-SNAPSHOT';
var RDCPATH = './riscoss-platform-core/riscoss-platform-rdc/';

var MAINWIKI_XAR = './riscoss-platform-core/riscoss-platform-dm/riscoss-platform-dm-distribution/' +
     'riscoss-platform-dm-ui-mainwiki-all/target/riscoss-platform-dm-ui-mainwiki-all.xar';
var WIKI_XAR = './riscoss-platform-core/riscoss-platform-dm/riscoss-platform-dm-distribution/' +
     'riscoss-platform-dm-ui-wiki-all/target/riscoss-platform-dm-ui-wiki-all.xar';

var ANALYSER = './riscoss-analyser/riscoss-remote-risk-analyser/target/' +
    'riscoss-remote-risk-analyser-*-jar-with-dependencies.jar';

var EVALUATOR_DEST = './riscoss-wiki-ui/src/xwiki/RISCOSSPlatformAnalysers/' +
    'LogicAnalyser/attachments/';

var NOFUNC = function () { };

var now = function () { return (new Date()).getTime(); };

var printLns = function (str, outLineCb) {
    var i = str.indexOf('\n');
    if (i === -1) { return str; }
    var line = str.substring(0,i);
    console.log(Math.floor(now() / 1000) + ' ' + line);
    outLineCb(line);
    return printLns(str.substring(i+1), outLineCb);
};

var bash = function (argStr, cb, outLineCb) {
    outLineCb = outLineCb || NOFUNC;
    console.log('+ ' + argStr);
    var bash = Spawn(STDBUF, [ '-o', 'L', BASH, '-c', argStr ]);
    var err = '';
    var out = '';
    var outc = '';
    bash.stdout.on('data', function (dat) {
        out = printLns(out + dat.toString(), outLineCb);
        outc += dat.toString();
    });
    bash.stderr.on('data', function (dat) { err = printLns(err + dat.toString(), NOFUNC); });
    bash.on('close', function (ret) {
        if (err !== '') { console.log(err); }
        if (out !== '') { console.log(out); }
        cb(ret, outc);
    });
    return bash;
};

var fastRm = function (dir, garbage, cb, doneCb) {
    doneCb = doneCb || NOFUNC;
    nThen(function (waitFor) {
        Fs.exists(dir, waitFor(function (exists) {
            if (!exists) { return; }
            var newName = dir.replace(/^.*\//, '') + '-' + String(Math.random()).substring(2);
            Fs.rename(dir, garbage + '/' + newName, waitFor(function (err) {
                if (err) { throw err; }
                // happens in parallel w/ build
                bash('rm -rf ' + garbage + '/' + newName, doneCb);
            }));
        }));
    }).nThen(cb);
};

var rmTargets = function (baseDir, garbage, callback) {
    var w = Walk(baseDir);
    w.on('error', function (err) { console.log(err); });
    nThen(function (waitFor) {
        w.on('directory', function (path, stat) {
            if (/\/target$/.test(path)) {
                fastRm(path, garbage, waitFor(), console.log("deleted " + path));
            }
        });
        w.on('end', waitFor());
    }).nThen(callback);
};

var plantSettingsXML = function (cb) {
    var mySettings;
    var theirSettings;
    nThen(function (waitFor) {
        Fs.readFile('./riscoss-platform-core/etc/settings.xml', waitFor(function (err, ret) {
            if (err) { throw err; }
            mySettings = ret.toString('utf8');
        }));
        Fs.readFile(process.env.HOME +'/.m2/settings.xml', waitFor(function (err, ret) {
            if (err && err.code === 'ENOENT') { return; }
            if (err) { throw err; }
            theirSettings = ret.toString('utf8');
        }));
    }).nThen(function (waitFor) {
        if (!theirSettings) {
            nThen(function (waitFor) {
                bash('mkdir ~/.m2', waitFor());
            }).nThen(function (waitFor) {
                Fs.writeFile(process.env.HOME +'/.m2/settings.xml', mySettings, waitFor(function (err) {
                    if (err) { throw err; }
                }));
            }).nThen(waitFor());
        } else if (mySettings !== theirSettings) {
            console.log("\n\n\nWARNING: you have a ~/.m2/settings.xml file which differs from " +
                "this project's, if the build fails then remove it and try again.\n\n\n");
        } else {
            console.log("settings files match, ok");
        }
    }).nThen(cb);
};

var throwIfRet = function (ret) { if (ret) { throw new Error("bash returned " + ret); } };

var main = function () {
    nThen(function (waitFor) {
        console.log(process.env);
        bash('rm -rf ./garbage ; mkdir ./garbage', waitFor());
    }).nThen(function (waitFor) {
        rmTargets('./riscoss-platform-core/', './garbage', waitFor());
        fastRm('build', './garbage', waitFor(), function () { console.log("deleted ./build"); });
        plantSettingsXML(waitFor());
    }).nThen(function (waitFor) {
        bash('cd riscoss-platform-core && mvn install', waitFor(throwIfRet));
        bash([
            'mkdir build',
            'cd build',
            'mkdir collectors',
            'tar -xf ../resources/apache-tomcat*'
        ].join(' && '), waitFor(throwIfRet));
    }).nThen(function (waitFor) {
        bash('cd riscoss-analyser && mvn install', waitFor(throwIfRet));
    }).nThen(function (waitFor) {
        bash('mkdir -p ' + EVALUATOR_DEST + ' && ' +
             'mv ' + ANALYSER + ' ' + EVALUATOR_DEST + '/analyser.jar', waitFor(throwIfRet));
    }).nThen(function (waitFor) {
        XWiki.Package.fromDirTree('./riscoss-wiki-config/src/', waitFor(function (pkg) {
            pkg.genXar('./build/riscoss-wiki-config.xar', waitFor());
        }));
    }).nThen(function (waitFor) {
        XWiki.Package.fromDirTree('./riscoss-wiki-ui/src/', waitFor(function (pkg) {
            pkg.genXar('./build/riscoss-wiki-ui.xar', waitFor());
        }));
    }).nThen(function (waitFor) {
        bash('mv ' + DMOUT + ' ./build', waitFor());
        bash('mv ' + RDROUT + ' ./build', waitFor());
        bash('mv ' + MAINWIKI_XAR + ' ./build', waitFor());
        bash('mv ' + WIKI_XAR + ' ./build', waitFor());
        bash('find ' + RDCPATH + " -name 'riscoss-platform-rdc-*-with-dependencies.jar' " +
            '-exec mv {} ./build/collectors/ \\;', waitFor());
        bash('cp ./resources/start.sh ./build', waitFor());
        bash('cp ./resources/import_xars.sh ./build', waitFor());
        bash('cp ./resources/*.xar ./build', waitFor());
    }).nThen(function (waitFor) {
        bash('cd resources/WEB-INF && tar -cf - . | ' +
            '( cd ../../build/riscoss-platform-dm-war-*-SNAPSHOT/WEB-INF/ && tar -xf - )',
            waitFor());
    }).nThen(function (waitFor) {
        bash('cd ./build && ./start.sh', waitFor());
    }).nThen(function (waitFor) {
        bash('cd ./build && ./import_xars.sh', waitFor());
    }).nThen(function (waitFor) {
        // collect stats on how often the project is built
        bash('curl -X POST "https://labs.xwiki.com/xwiki/bin/view/BuildCounters/?xpage=plain&project=riscoss"', waitFor());
    }).nThen(function (waitFor) {
        console.log('done...');
    });
};

main();
