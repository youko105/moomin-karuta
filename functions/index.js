'use strict';

process.env.DEBUG = 'actions-on-google:*';
const { DialogflowApp } = require('actions-on-google');

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

require('date-utils');

// actions
const ACTION_START = 'start';
const ACTION_NEXT = 'next';
const ACTION_REPEAT = 'repeat';
const ACTION_PREV = 'prev';
const ACTION_CONTINUE = 'continue';

// texts
const TXT_NEW_GAME = '新しいゲームの準備ができました。「次の札を読んで」と言って下さい';
const TXT_CONTINUE = 'では前回の続きを遊びましょう。「次の札を読んで」と言って下さい';
const TXT_READY = 'それでは読みます。';
const TXT_REPEAT = 'もう一度読みます。';
const TXT_PREV = '枚前の札を読みます。';
const TXT_ERR_CONTINUE = '前回のプレイデータがありませんでした。新しくゲームを始めるには「ニューゲーム」と言って下さい';
const TXT_ERR_NOTHING_CARD = 'もう読み札はありませんよ。結果はどうでしたか？また遊びましょうね';
const TXT_ERR_PREV = '枚前の札はありません';

// WEB API処理
exports.test = functions.https.onRequest((request, response) => {
  const app = new DialogflowApp({request, response});
  console.log('Request headers: ' + JSON.stringify(request.headers));
  console.log('Request body: ' + JSON.stringify(request.body));

  // user id 取得
  const uid = app.getUser().userId;
  console.log('[debug] userid : ' + uid);

  // シャッフル
  var shuffled = () => {
		var shuffle = () => { return Math.random() - 0.5 };
		var nums = [...Array(44).keys()];
		return nums.sort(shuffle);
  };

  // 読み札の取得
  const card = (cards, p, nums) => {
    // pがcardsの範囲にない場合はnull
    if (p < 0 || p >= cards.length ) {
      return null;
    }
    return cards[nums[p]];
  };

  // ユーザー情報取得
  admin.database().ref('/users/' + uid).once('value').then((snapshot) => {
    var user = snapshot.val() || {};

    // -------------------------
    // xつ前の札を読む
    // -------------------------
    const prevHandler = (app) => {
      // cardsの取得
      admin.database().ref('/cards').once('value').then((snapshot) => {
        const cards = snapshot.val() || [];

        // 数を取得
        let num = app.getArgument('number');
        if (num <= 0) num = 1;

        // 読み札を取得
        const c = card(cards, user['p'] - num, user['nums']);
        if (c === null) {
          app.ask(num + TXT_ERR_PREV);
        }

        // 読み上げる
        app.ask(num + TXT_PREV + c[1] + '。' + c[1]);
        return;

      }).catch((e) => {
		    console.log(e);
			  throw e;
      });
    };

    // -------------------------
    // もう一度読む
    // -------------------------
    const repeatHandler = (app) => {
      // cardsの取得
      admin.database().ref('/cards').once('value').then((snapshot) => {
        const cards = snapshot.val() || [];

        // 読み札を取得
        const c = card(cards, user['p'], user['nums']);
        if (c === null) {
          app.tell(TXT_ERR_NOTHING_CARD);
        }

        // 読み上げる
        app.ask(TXT_REPEAT + c[1] + '。' + c[1]);
        return;

      }).catch((e) => {
		    console.log(e);
			  throw e;
      });
    };

    // -------------------------
    // 次の札を読む
    // -------------------------
    const nextHandler = (app) => {
      // cardsの取得
      admin.database().ref('/cards').once('value').then((snapshot) => {
        const cards = snapshot.val() || [];

        // cursorを進める
        user['updated_at'] = new Date().toFormat("YYYYMMDDHH24MISS");
        user['p'] = user['p'] + 1;

        // 読み札を取得
        const c = card(cards, user['p'], user['nums']);
        if (c === null) {
          app.tell(TXT_ERR_NOTHING_CARD);
        }

        // DB 更新
        admin.database().ref('users/' + uid).update(user).then(() => {
          // 読み上げる
          app.ask(TXT_READY + c[1] + '。' + c[1]);
          return;

        }).catch((e) => {
		      console.log(e);
			    throw e;
        });
        return;

      }).catch((e) => {
		    console.log(e);
			  throw e;
      });
    };

    // -------------------------
    // 前回のゲームを探す
    // -------------------------
    const continueHandler = (app) => {
      if (user.length !== 0) {
        app.ask(TXT_CONTINUE);
        return;
      }

      // 前回のゲーム情報がなかったらニューゲーム
      user['updated_at'] = new Date().toFormat("YYYYMMDDHH24MISS");
      user['p'] = -1;
      user['nums'] = shuffled();

      // DB更新
      admin.database().ref('users/' + uid).update(user).then(() => {
        app.ask(TXT_ERR_CONTINUE);
        return;

      }).catch((e) => {
        console.log(e);
      throw e;
      });
    };

    // -------------------------
    // 新しいゲームの開始
    // -------------------------
    const startHandler = (app) => {
      user['updated_at'] = new Date().toFormat("YYYYMMDDHH24MISS");
      user['p'] = -1;
      user['nums'] = shuffled();

      // DB更新
      admin.database().ref('users/' + uid).update(user).then(() => {
        app.ask(TXT_NEW_GAME);
        return;

      }).catch((e) => {
        console.log(e);
		    throw e;
      });
    };

    // action mapping
    const actionMap = new Map();
    actionMap.set(ACTION_START, startHandler);
    actionMap.set(ACTION_NEXT, nextHandler);
    actionMap.set(ACTION_REPEAT, repeatHandler);
    actionMap.set(ACTION_PREV, prevHandler);
    actionMap.set(ACTION_CONTINUE, continueHandler);
    app.handleRequest(actionMap);
    return;

  }).catch((e) => {
    console.log(e);
	  throw e;
  });
});
